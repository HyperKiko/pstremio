import { Hono } from "hono";
import {
    makeProviders,
    makeStandardFetcher,
    targets,
    NotFoundError
} from "./providers";
import manifest from "../manifest.json";
import manifestIndex from "../manifest-index.json";
import { cors } from "hono/cors";
import { getMovieInfo, getTVInfo } from "./utils";
import type {
    FileBasedStream,
    Flags,
    MetaOutput,
    Qualities,
    Stream
} from "@p-stream/providers";
import HLSParser from "hls-parser";

const HEADER_OVERRIDES = {
    Origin: "https://pstream.mov",
    Referer: "https://pstream.mov/"
};

const providers = makeProviders({
    fetcher: makeStandardFetcher((url, ops) =>
        fetch(url, {
            ...ops,
            headers: {
                ...HEADER_OVERRIDES,
                ...ops?.headers
            }
        })
    ),
    target: targets.NATIVE
});

const app = new Hono();

app.use("*", cors({ origin: "*" }));

app.get("/configure", (c) => c.redirect("/"));
app.get("/:source/configure", (c) => c.redirect("/"));
app.get("/manifest.json", (c) => c.json(manifestIndex));

app.get("/api/sources", (c) => {
    return c.json(providers.listSources().map((source) => source.id));
});

app.get("/:source/manifest.json", (c) => {
    const source = c.req.param("source");
    const sourceMetadata = providers.getMetadata(source);
    if (!sourceMetadata)
        return c.json(
            {
                error: "Source not found."
            },
            400
        );

    c.header("Content-Type", "application/json");
    return c.body(
        JSON.stringify(manifest)
            .replaceAll("{{SOURCE_ID}}", sourceMetadata.id)
            .replaceAll("{{SOURCE_NAME}}", sourceMetadata.name)
            .replaceAll(
                '"{{SOURCE_TYPES}}"',
                JSON.stringify(
                    sourceMetadata.mediaTypes?.map((type) =>
                        type === "show" ? "series" : "movie"
                    )
                )
            )
    );
});

const getMediaInfo = async (type: string, id: string) =>
    type === "movie"
        ? await getMovieInfo(id.slice(0, -".json".length))
        : await getTVInfo(id.slice(0, -".json".length));

declare type Caption = FileBasedStream["captions"][number];

declare type ThumbnailTrack = Exclude<
    FileBasedStream["thumbnailTrack"],
    undefined
>;

declare type StreamCommon = {
    id: string;
    flags: Flags[];
    captions: Caption[];
    thumbnailTrack?: ThumbnailTrack;
    headers?: Record<string, string>;
    preferredHeaders?: Record<string, string>;
};

const getQuality = (res: HLSParser.types.Resolution): Qualities => {
    const map = {
        360: "360",
        480: "480",
        720: "720",
        1080: "1080",
        2160: "4k"
    } as const;

    const targetHeights = Object.keys(map).map(Number);
    const closest = targetHeights.reduce((a, b) =>
        Math.abs(res.height - a) < Math.abs(res.height - b) ? a : b
    );

    if (Math.abs(res.height - closest) > 100) return "unknown";
    return map[closest as keyof typeof map];
};

const convertCommon = (
    stream: StreamCommon,
    {
        quality,
        embedMeta,
        variant
    }: {
        quality?: Qualities;
        embedMeta?: MetaOutput;
        variant?: HLSParser.types.Variant;
    }
) => ({
    description: `${embedMeta ? `${embedMeta.name} - ` : ""}${stream.id}${
        quality || variant?.resolution
            ? ` (${quality || getQuality(variant?.resolution!)})`
            : ""
    }`,
    subtitles: stream.captions.map((caption) => ({
        id: caption.id,
        url: caption.url,
        lang: caption.language
    })),
    behaviorHints: {
        notWebReady:
            !stream.flags.includes("cors-allowed") ||
            (stream.headers && Object.keys(stream.headers).length),
        bingeGroup: `pstremio-${embedMeta?.id}-${stream.id}-${quality}`,
        proxyHeaders: {
            request: {
                ...HEADER_OVERRIDES,
                ...stream.headers,
                ...stream.preferredHeaders
            }
        }
    }
});

const convertStreams = (stream: Stream[], embedMeta?: MetaOutput) =>
    Promise.all(
        stream.map(async (stream) => {
            if (stream.flags.includes("ip-locked")) return [];
            if (stream.type === "file")
                return Object.entries(stream.qualities).map(
                    ([quality, file]) => ({
                        ...convertCommon(stream, {
                            quality: quality as Qualities,
                            embedMeta
                        }),
                        url: file.url
                    })
                );

            const playlist = HLSParser.parse(
                await fetch(stream.playlist, {
                    headers: {
                        ...HEADER_OVERRIDES,
                        ...stream.headers,
                        ...stream.preferredHeaders
                    }
                }).then((resp) => resp.text())
            );

            if (!playlist.isMasterPlaylist)
                return {
                    ...convertCommon(stream, { embedMeta }),
                    url: stream.playlist
                };

            return playlist.variants.map((variant) => ({
                ...convertCommon(stream, { embedMeta, variant }),
                url: new URL(variant.uri, stream.playlist).href
            }));
        })
    ).then((arr) => arr.flat());

app.get("/:source/stream/:type{(movie|series)}/:id{(.+)\\.json}", async (c) => {
    const source = c.req.param("source");
    const type = c.req.param("type");
    const id = c.req.param("id");
    const media = await getMediaInfo(type, id);
    let output;
    try {
        output = await providers.runSourceScraper({
            id: source,
            media
        });
    } catch (e) {
        if (e instanceof NotFoundError) return c.json({ streams: [] });
        throw e;
    }

    if (output.stream) {
        return c.json({
            streams: await convertStreams(output.stream)
        });
    }

    return c.json({
        streams: (
            await Promise.all(
                output.embeds.map(async (embed) => {
                    let embedOutput;
                    try {
                        embedOutput = await providers.runEmbedScraper({
                            id: embed.embedId,
                            url: embed.url
                        });
                    } catch (e) {
                        if (!(e instanceof NotFoundError)) console.error(e);
                        return [];
                    }
                    return await convertStreams(
                        embedOutput.stream,
                        providers.getMetadata(embed.embedId)!
                    );
                })
            )
        ).flat()
    });
});

export default app;

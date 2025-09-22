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

const convertCommon = (
    stream: StreamCommon,
    { quality, embedMeta }: { quality?: Qualities; embedMeta?: MetaOutput }
) => ({
    description: `${embedMeta ? `${embedMeta.name} - ` : ""}${stream.id}${
        quality ? ` (${quality})` : ""
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
            ...HEADER_OVERRIDES,
            ...stream.headers,
            ...stream.preferredHeaders
        }
    }
});

const convertStreams = (stream: Stream[], embedMeta?: MetaOutput) =>
    stream
        .map((stream) =>
            stream.flags.includes("ip-locked")
                ? []
                : stream.type === "file"
                ? Object.entries(stream.qualities).map(([quality, file]) => ({
                      ...convertCommon(stream, {
                          quality: quality as Qualities,
                          embedMeta
                      }),
                      url: file.url
                  }))
                : {
                      ...convertCommon(stream, { embedMeta }),
                      url: stream.playlist
                  }
        )
        .flat();

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
            streams: convertStreams(output.stream)
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
                    return convertStreams(
                        embedOutput.stream,
                        providers.getMetadata(embed.embedId)!
                    );
                })
            )
        ).flat()
    });
});

export default app;

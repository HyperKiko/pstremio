import type { MovieMedia, ShowMedia } from "@p-stream/providers";
import {
    getIMDBMovieDetails,
    getMovieDetails,
    getIMDBTVDetails,
    getTVDetails,
    getSeasonDetails
} from "./tmdb";

export const parseShowID = (id: string) =>
    id.split(":").length === 4
        ? {
              type: "tmdb" as const,
              id: id.split(":")[1],
              season: id.split(":")[2],
              episode: id.split(":")[3]
          }
        : {
              type: "imdb" as const,
              id: id.split(":")[0],
              season: id.split(":")[1],
              episode: id.split(":")[2]
          };

export const parseMovieID = (id: string) =>
    id.split(":").length === 2
        ? {
              type: "tmdb" as const,
              id: id.split(":")[1]
          }
        : {
              type: "imdb" as const,
              id: id.split(":")[0]
          };

export async function getTVInfo(id: string) {
    const metadata = parseShowID(id);
    let tmdbID;
    let name;
    let year;
    if (metadata.type === "tmdb") {
        tmdbID = Number(metadata.id);
        const object = await getTVDetails(tmdbID);
        name = object.name;
        year = object.year;
    } else {
        const object = await getIMDBTVDetails(metadata.id);
        tmdbID = object.id;
        name = object.name;
        year = object.year;
    }
    const seasonInfo = await getSeasonDetails(tmdbID, Number(metadata.season));
    return {
        type: "show" as const,
        title: name,
        releaseYear: year,
        imdbId: metadata.type === "imdb" ? metadata.id : undefined,
        tmdbId: tmdbID.toString(),
        season: {
            number: Number(metadata.season),
            title: seasonInfo.name,
            tmdbId: seasonInfo.id.toString(),
            episodeCount: seasonInfo.episodes.length
        },
        episode: {
            number: Number(metadata.episode),
            tmdbId: seasonInfo.episodes[Number(metadata.episode) - 1].id
        }
    } satisfies ShowMedia;
}
export type Media = MovieMedia | ShowMedia;

export async function getMovieInfo(id: string) {
    const metadata = parseMovieID(id);
    let tmdbID;
    let name;
    let year;
    if (metadata.type === "tmdb") {
        tmdbID = Number(metadata.id);
        const object = await getMovieDetails(tmdbID);
        name = object.name;
        year = object.year;
    } else {
        const object = await getIMDBMovieDetails(metadata.id);
        tmdbID = object.id;
        name = object.name;
        year = object.year;
    }
    return {
        type: "movie" as const,
        title: name,
        imdbId: metadata.type === "imdb" ? metadata.id : undefined,
        releaseYear: year,
        tmdbId: tmdbID.toString()
    } satisfies MovieMedia;
}

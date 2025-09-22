const TOKEN =
    "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhNTAwMDQ5ZjNlMDYxMDlmZTNlODI4OWIwNmNmNTY4NSIsInN1YiI6IjY1ZTEyNDAyMmQ1MzFhMDE4NWMwZjJmNSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.1J3EfnfmpJyZ4MV66eadk3h929zdeZfvjTO2JXhboWw"; // from p-stream

export function getIMDBInfo(id: string): Promise<any> {
    return fetch(
        `https://api.themoviedb.org/3/find/${id}?external_source=imdb_id`,
        {
            headers: {
                Authorization: `Bearer ${TOKEN}`
            }
        }
    ).then((res) => res.json());
}

export const getMovieDetails = (
    id: number
): Promise<{ name: string; year: number }> =>
    fetch(`https://api.themoviedb.org/3/movie/${id}?language=en-US`, {
        headers: {
            Authorization: `Bearer ${TOKEN}`
        }
    })
        .then((res) => res.json())
        .then((res: any) => ({
            name: res.original_name,
            year: res.release_date.split("-", 2)[0]
        }));

export const getIMDBMovieDetails = (
    id: string
): Promise<{ id: number; name: string; year: number }> =>
    getIMDBInfo(id).then((res) => ({
        name: res.movie_results[0].original_title,
        id: res.movie_results[0].id,
        year: Number(res.movie_results[0].release_date.split("-", 2)[0])
    }));

export const getTVDetails = (
    id: number
): Promise<{ name: string; year: number }> =>
    fetch(`https://api.themoviedb.org/3/tv/${id}?language=en-US`, {
        headers: {
            Authorization: `Bearer ${TOKEN}`
        }
    })
        .then((res) => res.json())
        .then((res: any) => ({
            name: res.original_name,
            year: res.first_air_date.split("-", 2)[0]
        }));

export const getIMDBTVDetails = (
    id: string
): Promise<{ id: number; name: string; year: number }> =>
    getIMDBInfo(id).then((res) => ({
        name: res.tv_results[0].original_name,
        id: res.tv_results[0].id,
        year: Number(res.tv_results[0].first_air_date.split("-", 2)[0])
    }));

export const getSeasonDetails = (
    id: number,
    number: number
): Promise<{ name: string; id: number; episodes: any[] }> =>
    fetch(
        `https://api.themoviedb.org/3/tv/${id}/season/${number}?language=en-US`,
        {
            headers: {
                Authorization: `Bearer ${TOKEN}`
            }
        }
    )
        .then((res) => res.json())
        .then((res: any) => ({
            name: res.name,
            id: res.id,
            episodes: res.episodes
        }));

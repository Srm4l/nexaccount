import { trpc } from "../providers/trpc";

export function useGames() {
  const { data } = trpc.games.list.useQuery(undefined, {
    staleTime: Infinity,
  });
  return data;
}

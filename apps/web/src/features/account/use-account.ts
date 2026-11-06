import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type AccountUser } from "../../lib/api.js";

/**
 * The account session.
 *
 * The session is a cookie the server owns. The browser only asks who it is
 * and carries the answer in the query cache; it never stores a token and
 * never writes the rider's server memory into localStorage.
 *
 * A signed-out rider is `null`, not an error. The planner works without an
 * account, so the account surface opens in its signed-out shape.
 */
export function useAccount(): {
  user: AccountUser | null;
  pending: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, password: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
} {
  const queryClient = useQueryClient();

  const account = useQuery({
    queryKey: ["account"],
    queryFn: () => api.account(),
    retry: false,
  });

  const signUp = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.signUp(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(["account"], data.user);
      // A new session must not read the previous account's memory. Removing
      // the query makes it fetch again for this rider.
      queryClient.removeQueries({ queryKey: ["account", "memory"] });
    },
  });

  const signIn = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.signIn(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(["account"], data.user);
      queryClient.removeQueries({ queryKey: ["account", "memory"] });
    },
  });

  const signOut = useMutation({
    mutationFn: () => api.signOut(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["account"] });
      queryClient.removeQueries({ queryKey: ["account", "memory"] });
    },
  });

  const changePassword = useMutation({
    mutationFn: ({
      currentPassword,
      password,
    }: {
      currentPassword: string;
      password: string;
    }) => api.changePassword(currentPassword, password),
  });

  const deleteAccount = useMutation({
    mutationFn: (password: string) => api.deleteAccount(password),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["account"] });
      queryClient.removeQueries({ queryKey: ["account", "memory"] });
    },
  });

  return {
    user: account.data ?? null,
    pending: account.isPending,
    signUp: async (email, password) => {
      await signUp.mutateAsync({ email, password });
    },
    signIn: async (email, password) => {
      await signIn.mutateAsync({ email, password });
    },
    signOut: async () => {
      await signOut.mutateAsync();
    },
    changePassword: async (currentPassword, password) => {
      await changePassword.mutateAsync({ currentPassword, password });
    },
    deleteAccount: async (password) => {
      await deleteAccount.mutateAsync(password);
    },
  };
}

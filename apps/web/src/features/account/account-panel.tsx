import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/button.js";
import { Spinner } from "../../components/ui/feedback.js";
import { Input } from "../../components/ui/input.js";
import { MarqueeText } from "../../components/ui/marquee-text.js";
import { Tab, TabPanel, Tabs } from "../../components/ui/tabs.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import {
  ApiError,
  api,
  type AccountUser,
  type NamedPlace,
  type PlaceSuggestion,
} from "../../lib/api.js";

/**
 * The account sheet.
 *
 * It is a paper panel on the map, not a page and not a glass card. A
 * signed-out rider signs in or creates an account; a signed-in rider sees
 * the address the account uses and the three things that change it.
 *
 * The sheet never owns the lists. It only reads the account session and
 * asks the page to sign out, because the page is what empties the local
 * memory after the session has ended.
 */

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

function PasswordToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  const label = shown ? "Hide password" : "Show password";
  return (
    <Tooltip label={label}>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label={label}
        onClick={onToggle}
        className="size-8"
      >
        {shown ? (
          <EyeOff aria-hidden className="size-4" />
        ) : (
          <Eye aria-hidden className="size-4" />
        )}
      </Button>
    </Tooltip>
  );
}

/**
 * The rider's named places.
 *
 * The label is the rider's word for a place. Home and Office are offered
 * as examples, not as the only names a place may have, so the chips stay
 * usable after the rider has used them.
 *
 * The list and the two writes belong to the page, which owns the query.
 * This form only holds the name being typed and the suggestion chosen
 * from it.
 */
function PlacesSection({
  places,
  onSavePlace,
  onRemovePlace,
}: {
  places: NamedPlace[];
  onSavePlace: (label: string, place: NamedPlace["place"]) => Promise<void>;
  onRemovePlace: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<PlaceSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const debouncedQuery = useSettledValue(trimmedQuery, 250);
  const searching = debouncedQuery.length >= 2;
  const suggestions = useQuery({
    queryKey: ["places", debouncedQuery],
    queryFn: ({ signal }) => api.places(debouncedQuery, signal),
    enabled: searching,
    staleTime: 60_000,
  });
  const results = (suggestions.data ?? []).slice(0, 4);
  const ready = chosen !== null && label.trim().length > 0;

  const choose = (suggestion: PlaceSuggestion): void => {
    setChosen(suggestion);
    setQuery(suggestion.name);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!chosen || label.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSavePlace(label.trim(), {
        kind: chosen.kind,
        id: chosen.id,
        name: chosen.name,
        latitude: chosen.latitude,
        longitude: chosen.longitude,
        systemId: chosen.systemId,
        systemName: chosen.systemName,
      });
      setLabel("");
      setQuery("");
      setChosen(null);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string): Promise<void> => {
    setRemoving(name);
    setError(null);
    try {
      await onRemovePlace(name);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="eyebrow">Places</p>
      <p className="text-[13px] leading-[1.5] text-ink-2">
        Name a place anything you like. Home and Office are examples, not a list you must fill.
      </p>

      {places.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {places.map((entry) => (
            <li key={entry.label} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <MarqueeText
                  text={entry.label}
                  className="text-[15px] font-medium leading-[1.45] text-ink"
                />
                <MarqueeText
                  text={entry.place.name}
                  className="mt-0.5 text-[13px] leading-[1.5] text-ink-2"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                aria-label={`Remove ${entry.label}`}
                disabled={removing === entry.label}
                onClick={() => void remove(entry.label)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input
          label="Name"
          placeholder="Home, Office, or any name"
          autoComplete="off"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />

        <div className="flex flex-wrap items-center gap-2">
          {["Home", "Office"].map((example) => (
            <Button
              key={example}
              variant="subtle"
              size="sm"
              onClick={() => setLabel(example)}
            >
              {example}
            </Button>
          ))}
        </div>

        <Input
          label="Place"
          placeholder="A stop, station, or landmark"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // Editing the name means the chosen suggestion is no longer
            // the place the field describes.
            setChosen(null);
          }}
        />

        {chosen ? (
          <div className="flex items-center gap-2 rounded-md border border-line-strong/70 bg-surface px-3 py-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full border-2 border-accent bg-surface"
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {chosen.name}
            </span>
            <span className="shrink-0 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
              Chosen
            </span>
          </div>
        ) : null}

        {chosen === null && trimmedQuery.length >= 2 ? (
          <div className="flex flex-col gap-1">
            {suggestions.isPending ? <Spinner label="Searching places" /> : null}
            {suggestions.isError ? (
              <p className="text-[13px] leading-[1.5] text-ink-2">
                Place suggestions could not be loaded. Check the connection and try again.
              </p>
            ) : null}
            {!suggestions.isPending && !suggestions.isError && results.length === 0 ? (
              <p className="text-[13px] leading-[1.5] text-ink-2">
                No places match that name.
              </p>
            ) : null}
            {results.length > 0 ? (
              <ul className="grid gap-1" aria-label="Place suggestions">
                {results.map((suggestion) => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onClick={() => choose(suggestion)}
                      className="press flex w-full cursor-pointer items-center gap-2 rounded-md border border-line-strong/70 bg-surface px-3 py-2 text-left transition-colors hover:border-ink hover:bg-surface-2"
                    >
                      <span
                        aria-hidden
                        className={
                          suggestion.kind === "station"
                            ? "size-2 shrink-0 rounded-full border-2 border-accent bg-surface"
                            : "size-2 shrink-0 rounded-[4px] bg-ink"
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                        {suggestion.name}
                      </span>
                      <span className="shrink-0 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
                        {suggestion.kind === "station" ? (suggestion.systemName ?? "Stop") : "Place"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" variant="primary" disabled={busy || !ready}>
          Save name
        </Button>
        {busy ? <Spinner label="Saving name" /> : null}
      </form>

      {error ? (
        <p role="alert" className="text-[13px] leading-[1.5] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AccountPanel({
  user,
  pending,
  places,
  memoryError,
  memoryLoadFailed,
  onSignUp,
  onSignIn,
  onSignOut,
  onChangePassword,
  onDeleteAccount,
  onRetryMemory,
  onSavePlace,
  onRemovePlace,
  onClose,
}: {
  user: AccountUser | null;
  pending: boolean;
  /** The places this rider named, or an empty list while they load. */
  places: NamedPlace[];
  memoryError: string | null;
  memoryLoadFailed: boolean;
  onSavePlace: (label: string, place: NamedPlace["place"]) => Promise<void>;
  onRemovePlace: (label: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onChangePassword: (currentPassword: string, password: string) => Promise<void>;
  onDeleteAccount: (password: string) => Promise<void>;
  onRetryMemory: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [action, setAction] = useState<"summary" | "password" | "delete">("summary");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const mismatch = mode === "create" && confirm.length > 0 && password !== confirm;
  const missing =
    email.trim().length === 0 ||
    password.length === 0 ||
    (mode === "create" && confirm.length === 0);

  const submitCredentials = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setFormError(null);
    try {
      if (mode === "signin") await onSignIn(email.trim(), password);
      else await onSignUp(email.trim(), password);
      setPassword("");
      setConfirm("");
      setShown(false);
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setShown(false);
      setAction("summary");
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await onDeleteAccount(deletePassword);
      setDeletePassword("");
      setAction("summary");
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (): Promise<void> => {
    setBusy(true);
    setFormError(null);
    try {
      await onSignOut();
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const credentialsForm = (
    <form onSubmit={submitCredentials} className="flex flex-col gap-3">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="name@email.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label="Password"
        type={shown ? "text" : "password"}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        placeholder={mode === "create" ? "At least 10 characters" : "Your password"}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        trailing={<PasswordToggle shown={shown} onToggle={() => setShown((current) => !current)} />}
      />
      {mode === "create" ? (
        <Input
          label="Confirm password"
          type={shown ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Repeat the password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          invalid={mismatch}
        />
      ) : null}
      {mismatch ? (
        <p role="alert" className="text-[12px] leading-[1.45] text-danger">
          Those passwords do not match.
        </p>
      ) : null}
      {formError ? (
        <p role="alert" className="text-[13px] leading-[1.5] text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={busy || missing}>
        {mode === "signin" ? "Sign in" : "Create account"}
      </Button>
      {busy ? (
        <Spinner label={mode === "signin" ? "Signing in" : "Creating account"} />
      ) : null}
    </form>
  );

  const credentialsPanel = (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-[1.5] text-ink-2">
        Saved places and watches on this device stay here until you sign in.
      </p>
      {credentialsForm}
    </div>
  );

  return (
    <section className="panel pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-[12px] border-t-2 border-t-ink max-h-[72dvh] lg:max-h-[calc(100dvh-8rem)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-3 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-[1.2] text-ink">Account</h2>
          <p className="mt-0.5 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
            {user ? "Signed in" : "This device"}
          </p>
        </div>
        <Tooltip label="Close account">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close account"
            onClick={onClose}
            className="size-8"
          >
            <X aria-hidden className="size-4" />
          </Button>
        </Tooltip>
      </header>

      <div className="scroll-quiet flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4">
        {user ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-[15px] leading-[1.55] font-medium text-ink">
                <MarqueeText text={user.email} />
              </p>
              {memoryError ? (
                <p role="alert" className="text-[13px] leading-[1.5] text-danger">
                  {memoryError}
                </p>
              ) : null}
              {memoryLoadFailed ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] leading-[1.5] text-danger">
                    Could not load your places.
                  </p>
                  <Button variant="secondary" size="sm" onClick={onRetryMemory}>
                    Retry
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="border-t border-line/70 pt-4">
              <PlacesSection
                places={places}
                onSavePlace={onSavePlace}
                onRemovePlace={onRemovePlace}
              />
            </div>

            {action === "summary" ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFormError(null);
                      setAction("password");
                    }}
                    disabled={busy}
                  >
                    Change password
                  </Button>
                  <Button variant="ghost" onClick={() => void signOut()} disabled={busy}>
                    Sign out
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setFormError(null);
                      setAction("delete");
                    }}
                    disabled={busy}
                  >
                    Delete account
                  </Button>
                </div>
                {formError ? (
                  <p role="alert" className="text-[13px] leading-[1.5] text-danger">
                    {formError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {action === "password" ? (
              <form onSubmit={submitPassword} className="flex flex-col gap-3">
                <Input
                  label="Current password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password you use now"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <Input
                  label="New password"
                  type={shown ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 10 characters"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  trailing={
                    <PasswordToggle
                      shown={shown}
                      onToggle={() => setShown((current) => !current)}
                    />
                  }
                />
                {formError ? (
                  <p role="alert" className="text-[13px] leading-[1.5] text-danger">
                    {formError}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={busy || currentPassword.length === 0 || newPassword.length === 0}
                  >
                    Change password
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFormError(null);
                      setAction("summary");
                    }}
                    disabled={busy}
                  >
                    Back
                  </Button>
                </div>
                {busy ? <Spinner label="Changing password" /> : null}
              </form>
            ) : null}

            {action === "delete" ? (
              <form onSubmit={submitDelete} className="flex flex-col gap-3">
                <p className="text-[13px] leading-[1.5] text-ink-2">
                  Delete this account? Places and watches stored with it are removed. This
                  device keeps nothing of them.
                </p>
                <Input
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password for this account"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
                {formError ? (
                  <p role="alert" className="text-[13px] leading-[1.5] text-danger">
                    {formError}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    variant="danger"
                    disabled={busy || deletePassword.length === 0}
                  >
                    Delete account
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFormError(null);
                      setAction("summary");
                    }}
                    disabled={busy}
                  >
                    Keep account
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : pending ? (
          <Spinner label="Loading account" />
        ) : (
          <Tabs
            value={mode}
            onValueChange={(next) => {
              if (next !== "signin" && next !== "create") return;
              setMode(next);
              setFormError(null);
              setConfirm("");
            }}
            panels={
              mode === "signin" ? (
                <TabPanel value="signin">{credentialsPanel}</TabPanel>
              ) : (
                <TabPanel value="create">{credentialsPanel}</TabPanel>
              )
            }
          >
            <Tab value="signin">Sign in</Tab>
            <Tab value="create">Create account</Tab>
          </Tabs>
        )}
      </div>
    </section>
  );
}

/**
 * A value that settles after the typing pauses.
 *
 * The suggestion list asks the server once the rider stops typing, so a
 * five-letter name is one request, not five.
 */
function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

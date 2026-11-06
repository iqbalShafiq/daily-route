import { Eye, EyeOff, LocateFixed, LogOut, Plus, Trash2, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/button.js";
import { ConfirmDialog } from "../../components/ui/confirm-dialog.js";
import { Spinner } from "../../components/ui/feedback.js";
import { Input } from "../../components/ui/input.js";
import { MarqueeText } from "../../components/ui/marquee-text.js";
import { Tab, TabPanel, Tabs } from "../../components/ui/tabs.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import { ApiError, type AccountUser, type NamedPlace } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { PlaceInput, type MemorySuggestion } from "../route-planner/place-input.js";
import type { ChosenPlace } from "../route-planner/place-memory.js";
import type { LocateResult } from "../route-planner/use-current-place.js";

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
 * The rider's saved places.
 *
 * A place is a name the rider chose, pointing at a stop or any other
 * location the search can find. The list and the writes belong to the
 * page. This form only holds what is being typed.
 */
function PlacesSection({
  places,
  onSavePlace,
  onRemovePlace,
  onUseCurrentLocation,
}: {
  places: NamedPlace[];
  onSavePlace: (label: string, place: NamedPlace["place"]) => Promise<void>;
  onRemovePlace: (label: string) => Promise<void>;
  /** Read the rider's position and turn it into a place with an address. */
  onUseCurrentLocation: () => Promise<LocateResult>;
}) {
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<ChosenPlace | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  /*
   * The saved places are the recommendations the find field opens with.
   * The same field is used to add a place, so a label the rider already
   * has can be copied into the new entry without searching again.
   */
  const memory = useMemo<MemorySuggestion[]>(
    () =>
      places.map((entry) => ({
        id: `${entry.label}:${entry.place.id}`,
        name: entry.label,
        detail: entry.place.address ?? entry.place.name,
        place: {
          kind: entry.place.kind,
          id: entry.place.id,
          name: entry.place.name,
          address: entry.place.address,
          latitude: entry.place.latitude,
          longitude: entry.place.longitude,
          systemId: entry.place.systemId,
          systemName: entry.place.systemName,
        },
      })),
    [places],
  );

  const ready = chosen !== null && label.trim().length > 0;

  /** A suggestion from the find field becomes the place being added. */
  const chooseFromFind = (place: ChosenPlace): void => {
    setChosen(place);
    setQuery(place.address ?? place.name);
    setFilter(place.address ?? place.name);
    setError(null);
    setAdding(true);
    // The find field is about to fold away; the caret belongs on the
    // name of the place that was just chosen.
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  /**
   * Mark where the rider is.
   *
   * The form opens with the address already in the place field and
   * "Current location" as the label; the rider only has to give it a
   * name they will recognise, such as Home or Office.
   */
  const markCurrentLocation = async (): Promise<void> => {
    setError(null);
    setLocating(true);
    try {
      const result = await onUseCurrentLocation();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const place = result.place;
      setChosen(place);
      setQuery(place.address ?? place.name);
      setFilter(place.address ?? place.name);
      setLabel("Current location");
      setAdding(true);
      requestAnimationFrame(() => nameRef.current?.focus());
    } finally {
      setLocating(false);
    }
  };

  const startAdding = (): void => {
    setError(null);
    setAdding(true);
  };

  const cancelAdding = (): void => {
    setError(null);
    setAdding(false);
    setLabel("");
    setQuery("");
    setChosen(null);
    setFilter("");
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
        address: chosen.address ?? null,
        latitude: chosen.latitude,
        longitude: chosen.longitude,
        systemId: chosen.systemId ?? null,
        systemName: chosen.systemName ?? null,
      });
      cancelAdding();
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

  const needle = adding ? "" : filter.trim().toLowerCase();
  const visible = needle
    ? places.filter((entry) =>
        `${entry.label} ${entry.place.name}`.toLowerCase().includes(needle),
      )
    : places;

  return (
    <div className="flex flex-col gap-3">
      {/*
       * The find field is the way into the list and into a new place. It
       * opens with the saved places and the map's own suggestions, and it
       * folds away when the chosen place takes over the sheet.
       */}
      <div
        data-place-find=""
        data-state={adding ? "closed" : "open"}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          adding ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div
          className={cn("min-h-0", adding ? "overflow-hidden" : "overflow-visible")}
          inert={adding || undefined}
          aria-hidden={adding || undefined}
        >
          <PlaceInput
            label="Find a place"
            value={filter}
            onValueChange={setFilter}
            onSelectPlace={chooseFromFind}
            placeholder="Search a saved place, stop, or address"
            memory={memory}
            floating
          />
        </div>
      </div>

      {places.length > 0 ? (
        visible.length > 0 ? (
          <ul className="scroll-quiet max-h-48 overflow-y-auto">
            {visible.map((entry) => (
              <li
                key={entry.label}
                className="flex items-center gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <MarqueeText
                    text={entry.label}
                    className="text-[15px] font-medium leading-[1.2] text-ink"
                  />
                  <p className="mt-0.5 truncate text-[13px] leading-[1.5] text-ink-2">
                    {entry.place.address ?? entry.place.name}
                  </p>
                </div>
                <Tooltip label={`Remove ${entry.label}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={`Remove ${entry.label}`}
                    disabled={removing === entry.label}
                    onClick={() => void remove(entry.label)}
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                </Tooltip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-[1.5] text-ink-2">No saved places match.</p>
        )
      ) : null}

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          adding ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div
          className={cn("min-h-0", adding ? "overflow-visible" : "overflow-hidden")}
          inert={!adding || undefined}
          aria-hidden={!adding || undefined}
        >
          <form
            onSubmit={submit}
            className={cn(
              "flex flex-col gap-3",
              places.length > 0 && "pt-2",
            )}
          >
            <Input
              ref={nameRef}
              label="Name"
              placeholder="A name for this place"
              autoComplete="off"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />

            <PlaceInput
              label="Place"
              value={query}
              placeholder="Search a stop, street, or place"
              memory={memory}
              floating
              onValueChange={(next) => {
                setQuery(next);
                // Editing the place means the chosen suggestion is no
                // longer the place the field describes.
                setChosen(null);
              }}
              onSelectPlace={(place) => {
                setChosen(place);
                setQuery(place.address ?? place.name);
              }}
            />

            {chosen ? (
              <div className="flex items-center gap-2 px-1 py-1">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full border-2 border-ink bg-surface"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                  {chosen.address ?? chosen.name}
                </span>
                <span className="shrink-0 text-[12px] leading-[1.35] text-ink-3">Chosen</span>
              </div>
            ) : null}

            <Button type="submit" variant="primary" className="w-full" disabled={busy || !ready}>
              Add place
            </Button>
            {busy ? <Spinner label="Saving name" /> : null}
            <Button variant="secondary" className="w-full" onClick={cancelAdding} disabled={busy}>
              Cancel
            </Button>
          </form>
        </div>
      </div>

      {adding ? null : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void markCurrentLocation()}
            disabled={locating}
          >
            <LocateFixed aria-hidden className="size-4" />
            {locating ? "Locating" : "Current location"}
          </Button>
          <Button variant="secondary" className="w-full" onClick={startAdding}>
            <Plus aria-hidden className="size-4" />
            Add a place
          </Button>
        </div>
      )}

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
  onUseCurrentLocation,
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
  onUseCurrentLocation: () => Promise<LocateResult>;
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
  const [section, setSection] = useState<"places" | "settings">("places");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const shellRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /*
   * A CSS transition cannot interpolate `height: auto`. Measure the
   * content, then set an explicit height so a tab, a form or a list
   * changes the sheet in one movement. The cap is the sheet's own
   * max-height; past that, the body scrolls.
   *
   * The content box is observed rather than the scrolling body, because
   * the body is clipped to the old height while the new one is applied.
   */
  useLayoutEffect(() => {
    const shell = shellRef.current;
    const content = contentRef.current;
    if (!shell || !content) return;

    const apply = (): void => {
      const max = Number.parseFloat(getComputedStyle(shell).maxHeight);
      const cap = Number.isFinite(max) ? max : Math.min(window.innerHeight * 0.72, 560);
      const header = headerRef.current?.offsetHeight ?? 0;
      const body = bodyRef.current;
      const bodyStyle = body ? getComputedStyle(body) : null;
      const pad = bodyStyle
        ? Number.parseFloat(bodyStyle.paddingTop) + Number.parseFloat(bodyStyle.paddingBottom)
        : 0;
      // Measure at the full width. A scrollbar during the height transition
      // would narrow the text and the next measurement would fight this one.
      const previousOverflow = body?.style.overflowY ?? "";
      if (body) body.style.overflowY = "hidden";
      const contentHeight = content.offsetHeight;
      if (body) body.style.overflowY = previousOverflow;
      const border = shell.offsetHeight - shell.clientHeight;
      const natural = header + contentHeight + pad + border;
      const next = Math.min(cap, Math.max(header, Math.ceil(natural)));
      const nextPx = `${next}px`;
      const scrolling = natural > cap + 1;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Reading the used height after a write cancels the transition.
      // Hide the scrollbar while the height is moving, then restore it
      // when the transition ends. The first write has nothing to move from.
      if (shell.style.height === "" || reduce) {
        shell.style.height = nextPx;
        if (body) body.style.overflowY = scrolling ? "auto" : "hidden";
        return;
      }
      if (shell.style.height !== nextPx) {
        if (body) body.style.overflowY = "hidden";
        shell.style.height = nextPx;
        return;
      }
      if (body) body.style.overflowY = scrolling ? "auto" : "hidden";
    };

    const onEnd = (event: TransitionEvent): void => {
      if (event.target !== shell || event.propertyName !== "height") return;
      apply();
    };

    apply();
    const observer = new ResizeObserver(() => apply());
    observer.observe(content);
    const header = headerRef.current;
    if (header) observer.observe(header);
    window.addEventListener("resize", apply);
    shell.addEventListener("transitionend", onEnd);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
      shell.removeEventListener("transitionend", onEnd);
    };
  }, []);

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
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async (): Promise<void> => {
    setBusy(true);
    setFormError(null);
    try {
      await onDeleteAccount(deletePassword);
      setDeletePassword("");
      setConfirmDelete(false);
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
        placeholder={mode === "create" ? "At least 8 characters" : "Your password"}
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
    <section
      ref={shellRef}
      className="panel pointer-events-auto flex max-h-[min(72dvh,560px)] min-h-0 w-full flex-col overflow-hidden rounded-[4px] transition-[height] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none lg:max-h-[min(62dvh,560px)]"
    >
      <header
        ref={headerRef}
        className="flex shrink-0 items-center gap-3 px-3 py-3"
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-[1.2] text-ink">Account</h2>
          {user ? (
            <p className="mt-0.5 truncate text-[13px] leading-[1.5] text-ink-2">{user.email}</p>
          ) : (
            <p className="mt-0.5 text-[12px] leading-[1.35] text-ink-3">This device</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close account"
          title="Close account"
          onClick={onClose}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center text-ink transition-colors pointer-fine:hover:bg-surface-2"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>

      <div ref={bodyRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div ref={contentRef} className="flex flex-col gap-4">
        {user ? (
          <div className="flex flex-col gap-4">
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

            <Tabs
              value={section}
              onValueChange={(next) => {
                if (next !== "places" && next !== "settings") return;
                setSection(next);
                setFormError(null);
                setConfirmDelete(false);
              }}
              panels={
                section === "settings" ? (
                  <TabPanel value="settings">
                    <SettingsSection />
                  </TabPanel>
                ) : (
                  <TabPanel value="places">
                    <PlacesSection
                      places={places}
                      onSavePlace={onSavePlace}
                      onRemovePlace={onRemovePlace}
                      onUseCurrentLocation={onUseCurrentLocation}
                    />
                  </TabPanel>
                )
              }
            >
              <Tab value="places">Places</Tab>
              <Tab value="settings">Settings</Tab>
            </Tabs>
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
      </div>
    </section>
  );

  function SettingsSection() {
    return (
      <div className="flex flex-col gap-4">
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
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                trailing={
                  <PasswordToggle shown={shown} onToggle={() => setShown((current) => !current)} />
                }
              />
              {formError && !confirmDelete && !confirmSignOut ? (
                <p role="alert" className="text-[13px] leading-[1.5] text-danger">
                  {formError}
                </p>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={busy || currentPassword.length === 0 || newPassword.length === 0}
              >
                Update password
              </Button>
              {busy && !confirmDelete && !confirmSignOut ? <Spinner label="Updating password" /> : null}
            </form>

            <div className="flex flex-col gap-2 pt-2">
              <p className="text-[13px] leading-[1.5] text-ink-2">
                Sign out leaves this device. Deleting the account removes the places stored with it.
              </p>
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  setFormError(null);
                  setConfirmSignOut(true);
                }}
                disabled={busy}
              >
                <LogOut aria-hidden className="size-4" />
                Sign out
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start text-danger hover:border-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => {
                  setFormError(null);
                  setDeletePassword("");
                  setConfirmDelete(true);
                }}
                disabled={busy}
              >
                <Trash2 aria-hidden className="size-4" />
                Delete account
              </Button>
            </div>

            <ConfirmDialog
              open={confirmSignOut}
              onOpenChange={setConfirmSignOut}
              title="Sign out"
              description="Saved places and watches stay with this account. This device keeps nothing of them."
              confirmLabel="Sign out"
              cancelLabel="Stay signed in"
              busy={busy}
              busyLabel="Signing out"
              error={confirmSignOut ? formError : null}
              onConfirm={() => void signOut()}
            />
            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={(next) => {
                setConfirmDelete(next);
                if (!next) {
                  setDeletePassword("");
                  setFormError(null);
                }
              }}
              title="Delete account"
              description="Places and watches stored with it are removed. This cannot be undone."
              confirmLabel="Delete account"
              cancelLabel="Keep account"
              tone="danger"
              busy={busy}
              busyLabel="Deleting account"
              confirmDisabled={deletePassword.length === 0}
              error={confirmDelete ? formError : null}
              onConfirm={() => void submitDelete()}
            >
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="Password for this account"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </ConfirmDialog>
      </div>
    );
  }
}



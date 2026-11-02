import { Eye, EyeOff, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "../../components/ui/button.js";
import { Spinner } from "../../components/ui/feedback.js";
import { Input } from "../../components/ui/input.js";
import { MarqueeText } from "../../components/ui/marquee-text.js";
import { Tab, TabPanel, Tabs } from "../../components/ui/tabs.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import { ApiError, type AccountUser } from "../../lib/api.js";

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

export function AccountPanel({
  user,
  pending,
  memoryError,
  memoryLoadFailed,
  onSignUp,
  onSignIn,
  onSignOut,
  onChangePassword,
  onDeleteAccount,
  onRetryMemory,
  onClose,
}: {
  user: AccountUser | null;
  pending: boolean;
  memoryError: string | null;
  memoryLoadFailed: boolean;
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
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label="Password"
        type={shown ? "text" : "password"}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        trailing={<PasswordToggle shown={shown} onToggle={() => setShown((current) => !current)} />}
      />
      {mode === "create" ? (
        <Input
          label="Confirm password"
          type={shown ? "text" : "password"}
          autoComplete="new-password"
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
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <Input
                  label="New password"
                  type={shown ? "text" : "password"}
                  autoComplete="new-password"
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

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { userRoleSchema } from "@/lib/constants/tech-taxonomy";
import {
  COMMAND_EVENTS,
  CommandPaletteContext,
  type CommandUser,
} from "./command-context";
import { CommandPalette } from "./command-palette";

const authResponseSchema = z.object({
  user: z
    .object({ id: z.string().min(1), role: userRoleSchema })
    .nullable(),
});

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export function CommandPaletteProvider({
  children,
}: CommandPaletteProviderProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<CommandUser | null | undefined>(undefined);

  useEffect(() => {
    document.body.dataset.commandReady = "true";
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/auth/me", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          setUser(null);
          return;
        }
        const parsed = authResponseSchema.safeParse(await response.json());
        setUser(parsed.success ? parsed.data.user : null);
      } catch {
        if (!controller.signal.aborted) {
          setUser(null);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const setOpenState = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  }, []);

  const openPalette = useCallback((nextQuery = "") => {
    setQuery(nextQuery);
    setOpen(true);
  }, []);

  const openSmartAdd = useCallback(() => {
    window.dispatchEvent(new Event(COMMAND_EVENTS.smartAdd));
  }, []);

  const openNotifications = useCallback(() => {
    window.dispatchEvent(new Event(COMMAND_EVENTS.notifications));
  }, []);

  const openMobileMenu = useCallback(() => {
    window.dispatchEvent(new Event(COMMAND_EVENTS.mobileMenu));
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          setOpenState(false);
        } else {
          openPalette();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, openPalette, setOpenState]);

  const value = useMemo(
    () => ({
      open,
      setOpen: setOpenState,
      query,
      setQuery,
      openPalette,
      openSmartAdd,
      openNotifications,
      openMobileMenu,
      user,
    }),
    [
      open,
      setOpenState,
      query,
      openPalette,
      openSmartAdd,
      openNotifications,
      openMobileMenu,
      user,
    ],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette />
    </CommandPaletteContext.Provider>
  );
}

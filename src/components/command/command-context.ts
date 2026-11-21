"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@/lib/constants/tech-taxonomy";

export interface CommandUser {
  id: string;
  role: UserRole;
}

export interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  openPalette: (query?: string) => void;
  openSmartAdd: () => void;
  openNotifications: () => void;
  openMobileMenu: () => void;
  user: CommandUser | null | undefined;
}

export const COMMAND_EVENTS = {
  smartAdd: "techhub:open-smart-add",
  notifications: "techhub:open-notifications",
  mobileMenu: "techhub:open-mobile-menu",
} as const;

export const CommandPaletteContext =
  createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const value = useContext(CommandPaletteContext);
  if (!value) {
    throw new Error("CommandPaletteContext ยังไม่ถูกติดตั้ง");
  }
  return value;
}

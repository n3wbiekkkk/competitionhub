import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  Cpu,
  Gamepad2,
  Globe,
  Palette,
  Rocket,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import type { TechCategory, TechCategoryIconName } from "@/lib/constants/tech-taxonomy";
import { TECH_CATEGORY_META } from "@/lib/constants/tech-taxonomy";

const CATEGORY_ICONS: Record<TechCategoryIconName, LucideIcon> = {
  Terminal,
  BrainCircuit,
  Globe,
  ShieldAlert,
  Cpu,
  Gamepad2,
  Rocket,
  Palette,
};

export function getCategoryIcon(category: TechCategory): LucideIcon {
  return CATEGORY_ICONS[TECH_CATEGORY_META[category].iconName];
}

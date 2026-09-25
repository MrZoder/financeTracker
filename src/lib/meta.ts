import {
  Banknote,
  Briefcase,
  Bus,
  Camera,
  Car,
  Cpu,
  Flag,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Laptop,
  type LucideIcon,
  Monitor,
  PiggyBank,
  Plane,
  Popcorn,
  Receipt,
  RefreshCw,
  Shield,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  Umbrella,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import type { AccountType, ExpenseCategory, Frequency, GoalKind, GoalPriority, IncomeType, PayFrequency } from "@/engine";

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; icon: LucideIcon; color: string }[] = [
  { value: "food", label: "Food", icon: Utensils, color: "#fb923c" },
  { value: "transport", label: "Transport", icon: Bus, color: "#60a5fa" },
  { value: "car", label: "Car", icon: Car, color: "#94a3b8" },
  { value: "entertainment", label: "Entertainment", icon: Popcorn, color: "#f472b6" },
  { value: "shopping", label: "Shopping", icon: ShoppingBag, color: "#c084fc" },
  { value: "technology", label: "Technology", icon: Cpu, color: "#38bdf8" },
  { value: "subscriptions", label: "Subscriptions", icon: RefreshCw, color: "#a3e635" },
  { value: "utilities", label: "Utilities", icon: Zap, color: "#fbbf24" },
  { value: "internet", label: "Internet & phone", icon: Wifi, color: "#2dd4bf" },
  { value: "housing", label: "Housing", icon: Home, color: "#f59e0b" },
  { value: "health", label: "Health", icon: Heart, color: "#f87171" },
  { value: "debt", label: "Debt", icon: Receipt, color: "#fb7185" },
  { value: "other", label: "Other", icon: Wallet, color: "#a1a1aa" },
];

export function categoryMeta(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

export const INCOME_TYPES: { value: IncomeType; label: string; icon: LucideIcon }[] = [
  { value: "salary", label: "EPEC pay", icon: Briefcase },
  { value: "freelance", label: "Freelance development", icon: Laptop },
  { value: "photography", label: "Photography", icon: Camera },
  { value: "side_job", label: "Side job", icon: Wrench },
  { value: "trading", label: "Trading", icon: TrendingUp },
  { value: "sale", label: "Sale", icon: Banknote },
  { value: "refund", label: "Refund", icon: RefreshCw },
  { value: "gift", label: "Gift", icon: Gift },
  { value: "other", label: "Other", icon: Sparkles },
];

export function incomeTypeMeta(value: string) {
  return INCOME_TYPES.find((c) => c.value === value) ?? INCOME_TYPES[INCOME_TYPES.length - 1];
}

export const GOAL_ICONS: Record<string, LucideIcon> = {
  target: Target,
  shield: Shield,
  cpu: Cpu,
  plane: Plane,
  flag: Flag,
  home: Home,
  car: Car,
  camera: Camera,
  laptop: Laptop,
  monitor: Monitor,
  gift: Gift,
  heart: Heart,
  graduation: GraduationCap,
  piggy: PiggyBank,
  briefcase: Briefcase,
  gamepad: Gamepad2,
  phone: Smartphone,
  umbrella: Umbrella,
  sparkles: Sparkles,
  wallet: Wallet,
  trending: TrendingUp,
};

export function goalIcon(name: string): LucideIcon {
  return GOAL_ICONS[name] ?? Target;
}

export const GOAL_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#2dd4bf", "#f472b6", "#a78bfa", "#fb923c", "#a3e635", "#f87171", "#e2e8f0"];

export const GOAL_KINDS: { value: GoalKind; label: string; hint: string }[] = [
  { value: "savings", label: "Savings", hint: "Money set aside towards something." },
  { value: "purchase", label: "Purchase", hint: "Saving up to buy a specific thing." },
  { value: "emergency", label: "Emergency fund", hint: "Funded before every other goal." },
  { value: "milestone", label: "Cash milestone", hint: "A target for total cash; nothing is earmarked." },
];

export const GOAL_PRIORITIES: { value: GoalPriority; label: string; tone: string }[] = [
  { value: "critical", label: "Critical", tone: "text-negative" },
  { value: "high", label: "High", tone: "text-warning" },
  { value: "normal", label: "Normal", tone: "text-accent" },
  { value: "low", label: "Low", tone: "text-fg-muted" },
];

export const FREQUENCIES: { value: Frequency; label: string; short: string }[] = [
  { value: "weekly", label: "Weekly", short: "wk" },
  { value: "fortnightly", label: "Fortnightly", short: "fn" },
  { value: "monthly", label: "Monthly", short: "mo" },
  { value: "quarterly", label: "Quarterly", short: "qtr" },
  { value: "annual", label: "Annual", short: "yr" },
];

export const PAY_FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "four_weekly", label: "Every 4 weeks" },
  { value: "monthly", label: "Monthly" },
];

export const ACCOUNT_TYPES: { value: AccountType; label: string; liquid: boolean }[] = [
  { value: "everyday", label: "Everyday", liquid: true },
  { value: "savings", label: "Savings", liquid: true },
  { value: "cash", label: "Cash", liquid: true },
  { value: "investment", label: "Investments", liquid: false },
  { value: "trading", label: "Trading account", liquid: false },
  { value: "other", label: "Other", liquid: true },
];

export const ASSET_TYPES = [
  { value: "vehicle", label: "Vehicle" },
  { value: "equipment", label: "Equipment" },
  { value: "property", label: "Property" },
  { value: "other", label: "Other" },
] as const;

export const LIABILITY_TYPES = [
  { value: "credit_card", label: "Credit card" },
  { value: "bnpl", label: "Buy now, pay later" },
  { value: "personal", label: "Personal debt" },
  { value: "loan", label: "Loan" },
  { value: "other", label: "Other" },
] as const;

export function frequencyLabel(f: Frequency | PayFrequency): string {
  switch (f) {
    case "weekly":
      return "weekly";
    case "fortnightly":
      return "fortnightly";
    case "four_weekly":
      return "every 4 weeks";
    case "monthly":
      return "monthly";
    case "quarterly":
      return "quarterly";
    case "annual":
      return "yearly";
  }
}

export function cycleNoun(payFrequency: PayFrequency | null | undefined): string {
  switch (payFrequency) {
    case "weekly":
      return "week";
    case "fortnightly":
      return "fortnight";
    case "four_weekly":
      return "4 weeks";
    case "monthly":
      return "month";
    default:
      return "pay cycle";
  }
}

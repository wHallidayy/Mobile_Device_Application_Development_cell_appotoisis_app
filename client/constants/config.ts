// API and App Configuration

// export const API_URL = 'http://10.0.2.2:8080/api/v1'; // Android emulator
// export const API_URL = 'http://localhost:8080/api/v1'; // iOS simulator
// export const API_URL = 'http://10.69.214.159:8080/api/v1'; // Physical device / LAN
export const API_URL = "https://bright-tough-weevil.ngrok-free.app/api/v1";

export const Colors = {
  // Main palette from UI design
  background: "#DAD5D2",
  primaryDark: "#383837",
  surface: "#E3E3E3",
  surfaceBorder: "#ccc",
  divider: "#989993",
  secondary: "#007AFF",

  // Text colors
  textPrimary: "#383837",
  textSecondary: "#514E4E",
  textMuted: "#535F6C",
  textPlaceholder: "#999",

  // Cell analysis colors
  apoptosis: "#E66C70",
  normal: "#2d9b87",
  other: "#A3A9B0",

  // UI elements
  white: "#FFFFFF",
  black: "#000000",
  imageBackground: "#000814",

  // Hover/active states
  primaryDarkHover: "#575755",

  // Sync status colors
  syncPending: '#F59E0B',   // Amber/yellow
  syncFailed: '#EF4444',    // Red
  syncSuccess: '#10B981',   // Green
};

export const Fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export const UserRoles = {
  RESEARCHER: "researcher",
  STUDENT: "student",
  LECTURER: "lecturer",
} as const;

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];

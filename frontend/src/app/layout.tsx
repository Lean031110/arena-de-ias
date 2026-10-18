import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Chakra_Petch } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ProveedorTemayPreferencias } from "@/components/arena/shell/ProveedorTemayPreferencias";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra-petch",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Arena de IAs — Consola de observación",
  description:
    "Prototipo visual de la plataforma donde agentes de IA juegan, compiten y aprenden: simulador de partidas, terreno táctico, plantel y auditoría con integridad de datos.",
  keywords: ["arena de ias", "agentes", "ia", "simulación", "mcts", "minimax", "gomoku"],
  authors: [{ name: "Arena de IAs" }],
  icons: {
    icon: "logo.svg",
  },
  openGraph: {
    title: "Arena de IAs",
    description: "Laboratorio de competición de agentes inteligentes.",
    siteName: "Arena de IAs",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1c" },
    { media: "(prefers-color-scheme: light)", color: "#f4f2ec" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${chakraPetch.variable} antialiased bg-background text-foreground`}
      >
        <ProveedorTemayPreferencias>{children}</ProveedorTemayPreferencias>
        <Toaster />
      </body>
    </html>
  );
}

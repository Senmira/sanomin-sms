import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SANOMIN SMS — Student Management System",
  description:
    "Administrator dashboard for SANOMIN International Preschool. Manage students, teachers, attendance, tuition classes and programs with barcode & fingerprint support.",
  keywords: [
    "SANOMIN",
    "preschool",
    "student management",
    "attendance",
    "barcode",
    "fingerprint",
    "tuition",
  ],
  authors: [{ name: "SANOMIN International Preschool" }],
  icons: {
    icon: "/sanomin-logo.jpg",
    apple: "/sanomin-logo.jpg",
  },
  openGraph: {
    title: "SANOMIN SMS",
    description: "Student Management System — SANOMIN International Preschool",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}

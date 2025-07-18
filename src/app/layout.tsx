import type { Metadata } from "next";
import { Bangers, Geist, Geist_Mono, Pacifico } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/provider";
import { useEffect, useRef, useState } from "react";
import LoadingIndicator from "@/components/Loading";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bangers = Bangers({
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Muxsin",
  description: "Generated by AS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {


  return (
    <html lang="en">
      <body className={`${bangers.className} max-w-[1920px] bg-white mx-auto`}>
        <LoadingIndicator />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

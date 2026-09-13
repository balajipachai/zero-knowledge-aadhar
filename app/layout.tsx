import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vidarbha First-Gen Grant",
  description:
    "Apply for the grant cycle by proving you're a real adult you haven't already applied — without ever sharing your Aadhaar number.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}

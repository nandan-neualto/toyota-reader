import type { Metadata } from "next";
import "./globals.css";
import "./kiosk-polish.css";
import "./employee-library.css";
export const metadata: Metadata = {
 title:"Toyota Employee Library", description:"Discover, read and listen. A personal learning library for Toyota employees.",
 manifest:"/manifest.webmanifest", icons:{icon:"/favicon.svg"}
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
 return <html lang="en"><body>{children}</body></html>;
}

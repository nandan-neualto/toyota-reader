import type { Metadata } from "next";
import "./globals.css";
import "./kiosk-polish.css";
export const metadata: Metadata = {
 title:"Toyota Reading Room", description:"Read and listen to books at the Toyota Experience Centre.",
 manifest:"/manifest.webmanifest", icons:{icon:"/favicon.svg"}
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
 return <html lang="en"><body>{children}</body></html>;
}

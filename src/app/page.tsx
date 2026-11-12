import { redirect } from "next/navigation";

// The demo opens straight on a real circle: the product, not a marketing page.
export default function Home() {
  redirect("/c/rosa");
}

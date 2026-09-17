import { notFound } from "next/navigation";
import { ResponsiveInspector } from "./responsive-inspector";

/** Build-time gated QA utility. It never bypasses the framed route's auth. */
export default function PreviewLayoutPage() {
  if (process.env.CONTEXT !== "deploy-preview") notFound();
  return <ResponsiveInspector />;
}

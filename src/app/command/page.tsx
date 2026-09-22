import { InteractiveCommandHub } from "@/components/InteractiveCommandHub";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clinical Command Center | Quarantine & Treatment Facility",
  description:
    "Live 74-bed floorplan telemetry, negative pressure air monitoring, and real-time clinical command center.",
};

export default function CommandPage() {
  return <InteractiveCommandHub />;
}

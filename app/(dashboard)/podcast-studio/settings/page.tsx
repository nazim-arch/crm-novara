import { prisma } from "@/lib/prisma";
import { Mic2, Settings } from "lucide-react";
import { StudioRatesSettings } from "@/components/podcast-studio/StudioRatesSettings";

export default async function PodcastStudioSettingsPage() {
  const rates = await prisma.podcastStudioRate.findMany({ orderBy: { seater_type: "asc" } });

  const serialized = rates.map(r => ({
    id: r.id,
    seater_type: r.seater_type,
    recording_rate_per_hour: Number(r.recording_rate_per_hour),
    editing_rate_per_hour: Number(r.editing_rate_per_hour),
  }));

  return (
    <div className="p-6 max-w-screen-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600 text-white flex items-center justify-center">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Mic2 className="h-5 w-5 text-violet-600" /> Studio Settings
          </h1>
          <p className="text-sm text-muted-foreground">Configure standard rates per seater type — used for auto-suggestions in booking form</p>
        </div>
      </div>

      <StudioRatesSettings initialRates={serialized} />
    </div>
  );
}

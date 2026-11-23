import { Card, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { RecommendationList } from "../dashboard/RecommendationList";

export function PlanSlotCard({ slot, busyId, onToggle }) {
  const Icon = slot.icon;
  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">{slot.items.length} actions</Badge>}>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Icon size={14} className="text-aurora-400" aria-hidden="true" />
          {slot.label}
        </CardTitle>
      </CardHeader>
      <div className="mt-4">
        <RecommendationList items={slot.items} onToggle={onToggle} busyId={busyId} />
      </div>
    </Card>
  );
}

export default PlanSlotCard;

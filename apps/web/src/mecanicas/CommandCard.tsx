export type CardStance = 'guard' | 'patrol' | 'attack';

const ORDERS: readonly { stance: CardStance; label: string }[] = [
  { stance: 'guard', label: 'Guardia' },
  { stance: 'patrol', label: 'Patrulla' },
  { stance: 'attack', label: 'Ataque' },
];

export function CommandCard({ disabled, stance, onStance }: {
  disabled: boolean;
  stance: CardStance | null;
  onStance: (stance: CardStance) => void;
}) {
  return <div className="command-card" role="group" aria-label="Órdenes del escuadrón">
    {ORDERS.map((order) => <button key={order.stance} type="button" disabled={disabled}
      aria-pressed={stance === order.stance} onClick={() => onStance(order.stance)}>{order.label}</button>)}
  </div>;
}

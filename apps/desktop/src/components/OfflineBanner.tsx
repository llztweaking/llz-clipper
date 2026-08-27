import { useNetworkStore } from "../stores/networkStore";

export function OfflineBanner() {
  const offline = useNetworkStore((state) => state.offline);
  if (!offline) return null;
  return <div className="offline-banner">Servidor indisponível — tentando reconectar</div>;
}

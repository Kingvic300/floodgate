import { useEffect, type ReactElement } from "react";
import { ActivityPage } from "./app/Activity";
import { Controls } from "./app/Controls";
import { Overview } from "./app/Overview";
import { Releases } from "./app/Releases";
import { SettingsPage } from "./app/Settings";
import { Shell } from "./app/Shell";
import { Brand } from "./components/Brand";
import { navigate, useRoute } from "./lib/router";
import { VaultProvider } from "./lib/vault";
import { WalletProvider, useWallet } from "./lib/wallet";
import { Connect } from "./pages/Connect";
import { Landing } from "./pages/Landing";

const PAGES: Record<string, { title: string; el: () => ReactElement }> = {
  "/app": { title: "Overview", el: Overview },
  "/app/releases": { title: "Releases", el: Releases },
  "/app/activity": { title: "Activity", el: ActivityPage },
  "/app/controls": { title: "Controls", el: Controls },
  "/app/settings": { title: "Settings", el: SettingsPage },
};

function Routes() {
  const route = useRoute();
  const { address } = useWallet();
  const page = PAGES[route];

  useEffect(() => {
    if (route.startsWith("/app") && !address) navigate("/connect");
  }, [route, address]);

  if (route === "/connect") {
    return (
      <Connect
        brand={<Brand />}
        title="Open the vault console"
        lede="See how much can leave right now, watch the release queue, and act as operator, guardian or admin."
        points={[
          "Reading a vault is free and needs no signature.",
          "Each action is signed in your wallet and checked by the contract.",
          "Works on testnet and mainnet.",
        ]}
      />
    );
  }
  if (page && address) {
    const El = page.el;
    return (
      <VaultProvider>
        <Shell route={route} title={page.title}>
          <El />
        </Shell>
      </VaultProvider>
    );
  }
  return <Landing />;
}

export default function App() {
  return (
    <WalletProvider storageKey="floodgate.session">
      <Routes />
    </WalletProvider>
  );
}

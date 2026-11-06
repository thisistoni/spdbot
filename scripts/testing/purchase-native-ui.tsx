import { createRoot } from "react-dom/client";
import { PurchaseAccessBar } from "../../src/components/PurchaseAccessBar";
import { setLocale } from "../../src/lib/i18n";
setLocale("de");
createRoot(document.getElementById("root")!).render(<PurchaseAccessBar />);

import { createRoot } from "react-dom/client"; import App from "./App"; import { ScrollButtons } from "./features/common/ScrollButtons"; import { registerPwa } from "./pwa/register"; import "./style.css"; createRoot(document.getElementById("root")!).render(<><App/><ScrollButtons/></>);
registerPwa();

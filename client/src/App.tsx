import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppLayout } from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Contas from "./pages/Contas";
import Historico from "./pages/Historico";
import Calendario from "./pages/Calendario";
import Gmail from "./pages/Gmail";
import NovaTransacao from "./pages/NovaTransacao";
import Notificacoes from "./pages/Notificacoes";
import Configuracoes from "./pages/Configuracoes";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/contas" component={Contas} />
        <Route path="/historico" component={Historico} />
        <Route path="/calendario" component={Calendario} />
        <Route path="/gmail" component={Gmail} />
        <Route path="/nova-transacao" component={NovaTransacao} />
        <Route path="/notificacoes" component={Notificacoes} />
        <Route path="/configuracoes" component={Configuracoes} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

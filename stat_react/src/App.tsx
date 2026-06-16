import { MstockOtpGate } from './components/niftyoptima/MstockOtpGate';
import { NiftyOptimaShell } from './pages/NiftyOptimaShell';

function App() {
  return (
    <MstockOtpGate onAuthenticated={() => window.dispatchEvent(new Event('mstock-auth-ok'))}>
      <NiftyOptimaShell />
    </MstockOtpGate>
  );
}

export default App;

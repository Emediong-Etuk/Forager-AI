import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ReportPage } from './pages/ReportPage';
import { VaultPage } from './pages/VaultPage';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/vault" element={<VaultPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

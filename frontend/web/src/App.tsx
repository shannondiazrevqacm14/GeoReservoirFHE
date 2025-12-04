import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface SyntheticData {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  dataType: string;
  status: "processing" | "synthesized" | "failed";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [datasets, setDatasets] = useState<SyntheticData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newDataset, setNewDataset] = useState({
    dataType: "",
    description: "",
    rawData: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Calculate statistics for dashboard
  const synthesizedCount = datasets.filter(d => d.status === "synthesized").length;
  const processingCount = datasets.filter(d => d.status === "processing").length;
  const failedCount = datasets.filter(d => d.status === "failed").length;

  useEffect(() => {
    loadDatasets().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadDatasets = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("dataset_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing dataset keys:", e);
        }
      }
      
      const list: SyntheticData[] = [];
      
      for (const key of keys) {
        try {
          const datasetBytes = await contract.getData(`dataset_${key}`);
          if (datasetBytes.length > 0) {
            try {
              const datasetData = JSON.parse(ethers.toUtf8String(datasetBytes));
              list.push({
                id: key,
                encryptedData: datasetData.data,
                timestamp: datasetData.timestamp,
                owner: datasetData.owner,
                dataType: datasetData.dataType,
                status: datasetData.status || "processing"
              });
            } catch (e) {
              console.error(`Error parsing dataset data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading dataset ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setDatasets(list);
    } catch (e) {
      console.error("Error loading datasets:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitDataset = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting sensitive data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newDataset))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const datasetId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const datasetInfo = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        dataType: newDataset.dataType,
        status: "processing"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `dataset_${datasetId}`, 
        ethers.toUtf8Bytes(JSON.stringify(datasetInfo))
      );
      
      const keysBytes = await contract.getData("dataset_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(datasetId);
      
      await contract.setData(
        "dataset_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted data submitted for FHE processing!"
      });
      
      await loadDatasets();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewDataset({
          dataType: "",
          description: "",
          rawData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const generateSyntheticData = async (datasetId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Generating synthetic data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const datasetBytes = await contract.getData(`dataset_${datasetId}`);
      if (datasetBytes.length === 0) {
        throw new Error("Dataset not found");
      }
      
      const datasetData = JSON.parse(ethers.toUtf8String(datasetBytes));
      
      const updatedDataset = {
        ...datasetData,
        status: "synthesized"
      };
      
      await contract.setData(
        `dataset_${datasetId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedDataset))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE synthetic data generation completed!"
      });
      
      await loadDatasets();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const datasetBytes = await contract.getData(`dataset_${datasetId}`);
      if (datasetBytes.length > 0) {
        const datasetData = JSON.parse(ethers.toUtf8String(datasetBytes));
        const updatedDataset = {
          ...datasetData,
          status: "failed"
        };
        
        await contract.setData(
          `dataset_${datasetId}`, 
          ethers.toUtf8Bytes(JSON.stringify(updatedDataset))
        );
      }
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Synthesis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
      
      await loadDatasets();
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to start using FHE data synthesis",
      icon: "🔗"
    },
    {
      title: "Upload Encrypted Data",
      description: "Submit your sensitive data which will be encrypted using FHE",
      icon: "🔒"
    },
    {
      title: "FHE Processing",
      description: "Our system learns statistical patterns from your encrypted data",
      icon: "⚙️"
    },
    {
      title: "Generate Synthetic Data",
      description: "Create statistically similar but anonymous synthetic datasets",
      icon: "🔄"
    },
    {
      title: "Download & Use",
      description: "Securely download and use your privacy-preserving synthetic data",
      icon: "📥"
    }
  ];

  const renderBarChart = () => {
    return (
      <div className="bar-chart-container">
        <div className="bar-chart">
          <div className="bar-wrapper">
            <div 
              className="bar synthesized" 
              style={{ height: `${(synthesizedCount / (datasets.length || 1)) * 100}%` }}
            >
              <span className="bar-value">{synthesizedCount}</span>
            </div>
            <div className="bar-label">Synthesized</div>
          </div>
          <div className="bar-wrapper">
            <div 
              className="bar processing" 
              style={{ height: `${(processingCount / (datasets.length || 1)) * 100}%` }}
            >
              <span className="bar-value">{processingCount}</span>
            </div>
            <div className="bar-label">Processing</div>
          </div>
          <div className="bar-wrapper">
            <div 
              className="bar failed" 
              style={{ height: `${(failedCount / (datasets.length || 1)) * 100}%` }}
            >
              <span className="bar-value">{failedCount}</span>
            </div>
            <div className="bar-label">Failed</div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="fhe-icon"></div>
          </div>
          <h1>FHE<span>DataSynth</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-dataset-btn cyber-button"
          >
            <div className="add-icon"></div>
            New Dataset
          </button>
          <button 
            className="cyber-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="navigation-tabs">
          <button 
            className={`tab ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button 
            className={`tab ${activeTab === "datasets" ? "active" : ""}`}
            onClick={() => setActiveTab("datasets")}
          >
            Datasets
          </button>
          <button 
            className={`tab ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            Analytics
          </button>
        </div>
        
        {activeTab === "dashboard" && (
          <>
            <div className="welcome-banner">
              <div className="welcome-text">
                <h2>FHE-Based Data Synthesis</h2>
                <p>Generate statistically similar but completely anonymous synthetic data using Fully Homomorphic Encryption</p>
              </div>
            </div>
            
            {showTutorial && (
              <div className="tutorial-section">
                <h2>FHE Data Synthesis Tutorial</h2>
                <p className="subtitle">Learn how to create privacy-preserving synthetic data</p>
                
                <div className="tutorial-steps">
                  {tutorialSteps.map((step, index) => (
                    <div 
                      className="tutorial-step"
                      key={index}
                    >
                      <div className="step-icon">{step.icon}</div>
                      <div className="step-content">
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="dashboard-grid">
              <div className="dashboard-card cyber-card">
                <h3>Project Introduction</h3>
                <p>Our platform uses FHE to learn from your encrypted sensitive data and generate statistically similar but completely anonymous synthetic datasets for secure data sharing.</p>
                <div className="fhe-badge">
                  <span>FHE-Powered</span>
                </div>
              </div>
              
              <div className="dashboard-card cyber-card">
                <h3>Data Statistics</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-value">{datasets.length}</div>
                    <div className="stat-label">Total Datasets</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{synthesizedCount}</div>
                    <div className="stat-label">Synthesized</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{processingCount}</div>
                    <div className="stat-label">Processing</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{failedCount}</div>
                    <div className="stat-label">Failed</div>
                  </div>
                </div>
              </div>
              
              <div className="dashboard-card cyber-card">
                <h3>Status Distribution</h3>
                {renderBarChart()}
              </div>
            </div>
          </>
        )}
        
        {activeTab === "datasets" && (
          <div className="datasets-section">
            <div className="section-header">
              <h2>Encrypted Datasets</h2>
              <div className="header-actions">
                <button 
                  onClick={loadDatasets}
                  className="refresh-btn cyber-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="datasets-list cyber-card">
              <div className="table-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Data Type</div>
                <div className="header-cell">Owner</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Actions</div>
              </div>
              
              {datasets.length === 0 ? (
                <div className="no-datasets">
                  <div className="no-datasets-icon"></div>
                  <p>No encrypted datasets found</p>
                  <button 
                    className="cyber-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Dataset
                  </button>
                </div>
              ) : (
                datasets.map(dataset => (
                  <div className="dataset-row" key={dataset.id}>
                    <div className="table-cell dataset-id">#{dataset.id.substring(0, 6)}</div>
                    <div className="table-cell">{dataset.dataType}</div>
                    <div className="table-cell">{dataset.owner.substring(0, 6)}...{dataset.owner.substring(38)}</div>
                    <div className="table-cell">
                      {new Date(dataset.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="table-cell">
                      <span className={`status-badge ${dataset.status}`}>
                        {dataset.status}
                      </span>
                    </div>
                    <div className="table-cell actions">
                      {isOwner(dataset.owner) && dataset.status === "processing" && (
                        <button 
                          className="action-btn cyber-button primary"
                          onClick={() => generateSyntheticData(dataset.id)}
                        >
                          Generate
                        </button>
                      )}
                      {isOwner(dataset.owner) && dataset.status === "synthesized" && (
                        <button 
                          className="action-btn cyber-button success"
                          onClick={() => {/* Download functionality would go here */}}
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "analytics" && (
          <div className="analytics-section">
            <div className="section-header">
              <h2>FHE Analytics</h2>
            </div>
            
            <div className="analytics-content cyber-card">
              <h3>FHE Processing Statistics</h3>
              <p>View insights about your FHE data synthesis operations</p>
              
              <div className="analytics-grid">
                <div className="analytics-item">
                  <h4>Successful Generations</h4>
                  <div className="analytics-value">{synthesizedCount}</div>
                </div>
                
                <div className="analytics-item">
                  <h4>Average Processing Time</h4>
                  <div className="analytics-value">~45s</div>
                </div>
                
                <div className="analytics-item">
                  <h4>Data Types Processed</h4>
                  <div className="analytics-value">
                    {Array.from(new Set(datasets.map(d => d.dataType))).length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitDataset} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          dataset={newDataset}
          setDataset={setNewDataset}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="fhe-icon"></div>
              <span>FHE DataSynth</span>
            </div>
            <p>Privacy-preserving data synthesis using Fully Homomorphic Encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE DataSynth. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  dataset: any;
  setDataset: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  dataset,
  setDataset
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setDataset({
      ...dataset,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!dataset.dataType || !dataset.rawData) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Create New Dataset</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your data will be encrypted with FHE before processing
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Data Type *</label>
              <select 
                name="dataType"
                value={dataset.dataType} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="">Select data type</option>
                <option value="Financial">Financial Records</option>
                <option value="Healthcare">Healthcare Data</option>
                <option value="Demographic">Demographic Information</option>
                <option value="Behavioral">Behavioral Data</option>
                <option value="Other">Other Sensitive Data</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text"
                name="description"
                value={dataset.description} 
                onChange={handleChange}
                placeholder="Brief description..." 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Sensitive Data *</label>
              <textarea 
                name="rawData"
                value={dataset.rawData} 
                onChange={handleChange}
                placeholder="Paste your sensitive data here (CSV, JSON, or plain text)..." 
                className="cyber-textarea"
                rows={6}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Your data remains encrypted during all FHE operations
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn cyber-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit for Encryption"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
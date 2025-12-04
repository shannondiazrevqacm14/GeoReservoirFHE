// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract GeothermalReservoirFHE is SepoliaConfig {
    struct EncryptedReservoirData {
        uint256 id;
        euint32 encryptedPressure;    // Encrypted reservoir pressure
        euint32 encryptedTemperature; // Encrypted temperature reading
        euint32 encryptedFlowRate;    // Encrypted fluid flow rate
        uint256 timestamp;
    }
    
    struct DecryptedReservoirData {
        uint32 pressure;
        uint32 temperature;
        uint32 flowRate;
        bool isRevealed;
    }

    uint256 public dataCount;
    mapping(uint256 => EncryptedReservoirData) public encryptedData;
    mapping(uint256 => DecryptedReservoirData) public decryptedData;
    
    mapping(uint32 => euint32) private encryptedPerformanceScore;
    uint32[] private performanceThresholds;
    
    mapping(uint256 => uint256) private requestToDataId;
    
    event DataSubmitted(uint256 indexed id, uint256 timestamp);
    event AnalysisRequested(uint256 indexed id);
    event DataDecrypted(uint256 indexed id);
    
    modifier onlyOperator(uint256 dataId) {
        _;
    }
    
    function submitEncryptedData(
        euint32 pressure,
        euint32 temperature,
        euint32 flowRate
    ) public {
        dataCount += 1;
        uint256 newId = dataCount;
        
        encryptedData[newId] = EncryptedReservoirData({
            id: newId,
            encryptedPressure: pressure,
            encryptedTemperature: temperature,
            encryptedFlowRate: flowRate,
            timestamp: block.timestamp
        });
        
        decryptedData[newId] = DecryptedReservoirData({
            pressure: 0,
            temperature: 0,
            flowRate: 0,
            isRevealed: false
        });
        
        emit DataSubmitted(newId, block.timestamp);
    }
    
    function requestDataAnalysis(uint256 dataId) public onlyOperator(dataId) {
        EncryptedReservoirData storage data = encryptedData[dataId];
        require(!decryptedData[dataId].isRevealed, "Already analyzed");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(data.encryptedPressure);
        ciphertexts[1] = FHE.toBytes32(data.encryptedTemperature);
        ciphertexts[2] = FHE.toBytes32(data.encryptedFlowRate);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.analyzeReservoirData.selector);
        requestToDataId[reqId] = dataId;
        
        emit AnalysisRequested(dataId);
    }
    
    function analyzeReservoirData(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dataId = requestToDataId[requestId];
        require(dataId != 0, "Invalid request");
        
        EncryptedReservoirData storage eData = encryptedData[dataId];
        DecryptedReservoirData storage dData = decryptedData[dataId];
        require(!dData.isRevealed, "Already analyzed");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        
        dData.pressure = results[0];
        dData.temperature = results[1];
        dData.flowRate = results[2];
        dData.isRevealed = true;
        
        emit DataDecrypted(dataId);
    }
    
    function calculatePerformanceScore(uint256 dataId) public onlyOperator(dataId) {
        DecryptedReservoirData memory data = decryptedData[dataId];
        require(data.isRevealed, "Data not available");
        
        euint32 encryptedScore = FHE.add(
            FHE.add(
                FHE.mul(FHE.asEuint32(data.pressure), FHE.asEuint32(40)),
                FHE.mul(FHE.asEuint32(data.temperature), FHE.asEuint32(30))
            ),
            FHE.mul(FHE.asEuint32(data.flowRate), FHE.asEuint32(30))
        );
        
        encryptedPerformanceScore[dataId] = encryptedScore;
    }
    
    function requestScoreDecryption(uint256 dataId) public onlyOperator(dataId) {
        euint32 score = encryptedPerformanceScore[dataId];
        require(FHE.isInitialized(score), "Score not calculated");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(score);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptPerformanceScore.selector);
        requestToDataId[reqId] = dataId;
    }
    
    function decryptPerformanceScore(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dataId = requestToDataId[requestId];
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 score = abi.decode(cleartexts, (uint32));
        // Handle decrypted score as needed
    }
    
    function getDecryptedData(uint256 dataId) public view returns (
        uint32 pressure,
        uint32 temperature,
        uint32 flowRate,
        bool isRevealed
    ) {
        DecryptedReservoirData storage d = decryptedData[dataId];
        return (d.pressure, d.temperature, d.flowRate, d.isRevealed);
    }
}
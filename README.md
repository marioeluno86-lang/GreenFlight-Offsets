# 🌱 GreenFlight Offsets

Welcome to a revolutionary Web3 solution for tackling aviation's carbon footprint! This project creates a transparent, blockchain-based system on Stacks that links real-world flights to verified reforestation projects, ensuring verifiable carbon offsets and reducing greenwashing in the aviation industry.

## ✨ Features

🔗 Direct linkage between flight emissions and on-chain reforestation credits  
🌳 Verification of reforestation projects through decentralized oracles  
📊 Immutable tracking of carbon offsets for audits and reporting  
💰 Tokenized offsets for easy purchase, trading, and retirement  
✅ Real-time transparency for airlines, passengers, and environmental watchdogs  
🚫 Fraud prevention via smart contract logic and multi-signature approvals  
📈 Analytics dashboard for emission trends and offset impacts  

## 🛠 How It Works

This system uses 8 smart contracts written in Clarity to handle registration, verification, matching, tokenization, and governance. It solves the real-world problem of opaque carbon offset markets in aviation, where claims are often unverified, by providing end-to-end transparency on the blockchain.

### Key Smart Contracts
1. **FlightRegistry.clar**: Registers flight details (e.g., route, emissions calculated via standard formulas) and generates a unique flight ID. Prevents duplicate registrations.  
2. **ReforestationRegistry.clar**: Onboards and verifies reforestation projects (e.g., tree planting initiatives) with data like location, projected CO2 sequestration, and third-party audits. Uses multi-sig for approval.  
3. **EmissionCalculator.clar**: Computes carbon emissions for flights based on inputs like distance, aircraft type, and fuel efficiency. Integrates with off-chain data feeds if needed.  
4. **OffsetMatcher.clar**: Automatically or manually matches flight emissions to available reforestation credits, creating immutable links between flight IDs and project credits.  
5. **CarbonToken.clar**: Mints fungible tokens (e.g., CARB tokens) representing verified carbon offsets. Handles minting, burning (retirement), and transfers.  
6. **VerificationOracle.clar**: Interfaces with decentralized oracles to confirm real-world data, such as satellite imagery for reforestation progress or flight logs.  
7. **PaymentGateway.clar**: Manages STX or token payments for purchasing offsets, distributing funds to project owners and airlines. Includes escrow for disputes.  
8. **Governance.clar**: Allows token holders to vote on system updates, project approvals, or parameter changes (e.g., emission factors). Uses DAO-like mechanics for decentralization.

**For Airlines/Passengers**  
- Register a flight via FlightRegistry with emission data (auto-calculated by EmissionCalculator).  
- Purchase offsets through PaymentGateway, which mints CARB tokens.  
- Use OffsetMatcher to link the flight to a verified reforestation project from ReforestationRegistry.  
- Retire tokens via CarbonToken to permanently offset emissions.  

**For Project Owners (Reforestation Initiatives)**  
- Submit project details to ReforestationRegistry for verification.  
- Once approved via VerificationOracle and multi-sig, receive credits that can be matched to flights.  
- Earn payments when offsets are purchased and linked.  

**For Verifiers/Auditors**  
- Query any contract (e.g., get-flight-details from FlightRegistry or verify-project from ReforestationRegistry) for immutable records.  
- Use Governance to propose audits or updates.  

That's it! A fully transparent loop from emission calculation to verified sequestration, all on-chain for trustless accountability.
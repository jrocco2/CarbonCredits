// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, upgrades } from "hardhat";
import { BaseCarbonTonne, CarbonOffsetBatches, CarbonProjects, CarbonProjectVintages, ToucanCarbonOffsets, ToucanCarbonOffsetsBeacon, ToucanCarbonOffsetsFactory, ToucanContractRegistry } from "../typechain";

let registry: ToucanContractRegistry
let batchNFT: CarbonOffsetBatches
let tco2Factory: ToucanCarbonOffsetsFactory
let tco2: ToucanCarbonOffsets
let tco2Beacon: ToucanCarbonOffsetsBeacon
let vintages: CarbonProjectVintages
let projects: CarbonProjects
let bct: BaseCarbonTonne

let owner;
let user;
let verifier;
let manager;
let addrs;

async function main() {

  [owner, user, verifier, manager, ...addrs] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("ToucanContractRegistry");
  registry = await upgrades.deployProxy(
    Registry,
    { kind: "uups" }
  ) as ToucanContractRegistry

  console.log("Registry deployed to:", registry.address);

  const BatchNFT = await ethers.getContractFactory("CarbonOffsetBatches");
  batchNFT = await upgrades.deployProxy(
    BatchNFT,
    [registry.address],
    { kind: "uups" }
  ) as CarbonOffsetBatches

  await registry.setCarbonOffsetBatchesAddress(batchNFT.address)
  console.log("BatchNFT deployed to:", batchNFT.address);

  await batchNFT.grantRole(await batchNFT.VERIFIER_ROLE(), verifier.address);
  console.log("Verifier role granted to:", verifier.address);

  const TCO2Factory = await ethers.getContractFactory("ToucanCarbonOffsetsFactory");
  tco2Factory = await upgrades.deployProxy(
    TCO2Factory,
    [registry.address],
    { kind: "uups" }
  ) as ToucanCarbonOffsetsFactory

  console.log("TCO2Factory deployed to:", tco2Factory.address);

  registry.setToucanCarbonOffsetsFactoryAddress(tco2Factory.address)
  console.log("Registry updated with TCO2Factory address")

  const TCO2 = await ethers.getContractFactory("ToucanCarbonOffsets");
  tco2 = await TCO2.deploy()

  console.log("TCO2 deployed to:", tco2.address);

  const TCO2Beacon = await ethers.getContractFactory("ToucanCarbonOffsetsBeacon");
  tco2Beacon = await TCO2Beacon.deploy(tco2.address)

  console.log("TCO2Beacon deployed to:", tco2Beacon.address);

  await tco2Factory.setBeacon(tco2Beacon.address);
  console.log("TCO2Factory updated with TCO2Beacon address")

  const Vintages = await ethers.getContractFactory("CarbonProjectVintages");
  vintages = await upgrades.deployProxy(
    Vintages,
    { kind: "uups" }
  ) as CarbonProjectVintages

  await vintages.grantRole(await vintages.MANAGER_ROLE(), manager.address);
  await vintages.setToucanContractRegistry(registry.address);
  await registry.setCarbonProjectVintagesAddress(vintages.address)
  console.log("Vintages deployed to:", vintages.address);

  const Projects = await ethers.getContractFactory("CarbonProjects");
  projects = await upgrades.deployProxy(
    Projects,
    { kind: "uups" }
  ) as CarbonProjects

  await projects.grantRole(await projects.MANAGER_ROLE(), manager.address);
  await projects.setToucanContractRegistry(registry.address);
  await registry.setCarbonProjectsAddress(projects.address)

  const BCT = await ethers.getContractFactory("BaseCarbonTonne");
  bct = await upgrades.deployProxy(
    BCT,
    { kind: "uups" }
  ) as BaseCarbonTonne

  await bct.setToucanContractRegistry(registry.address);
  await bct.setSupplyCap(ethers.utils.parseEther("1000000"));

  // -------------------------------------------------------------------------------------------------
  // Step 1: Mint BatchNFT
  await batchNFT.mintEmptyBatch(user.address)

  const tokenId = await batchNFT.batchTokenCounter()
  console.log("Minted TokenId:", tokenId.toString())

  // Step 2: Retire NFTs on registry, and update batch NFT with details of retirement
  const serialNumber = "ABC-123456789"
  const quantity = 100
  const uri = ''
  await batchNFT.connect(user).updateBatchWithData(
    tokenId,
    serialNumber,
    quantity,
    uri
  )

  console.log("Updated batch with data")
  // Step 3: Verifier links with vintage (and creates new vintage if it doesnt exist)

  const to1 = manager.address
  const projectId = 'Test Project'
  const standard = ''
  const methodology = ''
  const region = ''
  const storageMethod = ''
  const method = ''
  const emissionType = ''
  const category = ''
  const uri1 = ''

  await projects.addNewProject(
    to1,
    projectId,
    standard,
    methodology,
    region,
    storageMethod,
    method,
    emissionType,
    category,
    uri1,
  )

  console.log("Added new project")
  const to = manager.address
  const projectTokenId = 1
  const name = "Test Vintage"
  const startTime = 123
  const endTime = 124
  const totalVintageQuantity = 100
  const isCorsiaCompliant = false
  const isCCPcompliant = false
  const coBenefits = ''
  const correspAdjustment = ''
  const additionalCertification = ''
  const vUri = ''
  
  await vintages.connect(manager).addNewVintage(
    to,
    projectTokenId,
    name,
    startTime,
    endTime,
    totalVintageQuantity,
    isCorsiaCompliant,
    isCCPcompliant,
    coBenefits,
    correspAdjustment,
    additionalCertification,
    vUri,
  )
  console.log("Added new vintage")
  await tco2Factory.deployFromVintage(1);
  console.log("Deployed TCO2 from vintage")
  await batchNFT.connect(verifier).linkWithVintage(tokenId, 1)
  console.log("Linked batch with vintage")
  // Step 4: Verifier confirms Credits have been retired
  await batchNFT.connect(verifier).confirmRetirement(tokenId)
  console.log("Confirmed retirement")
  // Step 5: Fractionalize
  await batchNFT.connect(user).fractionalize(tokenId)
  console.log("Fractionalized")
  // Step 6: Mint BCT
  let tokenAddress = await tco2Factory.pvIdtoERC20(1)
  console.log("tokenAddress: ", tokenAddress)
  let tco2Dynamic = await TCO2.attach(tokenAddress)
  await tco2Dynamic.connect(user).approve(bct.address, ethers.utils.parseEther("100"))
  await bct.connect(user).deposit(tokenAddress, ethers.utils.parseEther("100"))
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

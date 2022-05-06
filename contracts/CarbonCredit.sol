// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// This method works if all carbon credits within a project and vintage are considered equal
contract CarbonCredit is
    Initializable,
    ERC1155Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ERC1155BurnableUpgradeable,
    ERC1155SupplyUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    event BatchCreated(address indexed sender, uint256 indexed tokenId, uint64 indexed startTime, uint64 endTime, string projectId);
    event BatchVerified(address indexed sender, uint256 indexed tokenId, uint256 indexed status);
    event CreditsRequested(address indexed sender, uint256 indexed tokenId, uint256 indexed amount, string serialNumber);
    event CreditsApproved(address indexed sender, address indexed user, uint256 indexed tokenId, string serialNumber);
    event CreditsRejected(address indexed sender, address indexed user, uint256 indexed tokenId, string serialNumber);

    function initialize() public initializer {
        __ERC1155_init("");
        __AccessControl_init();
        __Pausable_init();
        __ERC1155Burnable_init();
        __ERC1155Supply_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }

    struct BatchData {
        string projectId;
        string standard;
        string methodology;
        string region;
        uint256 maxQuantity;
        uint64 startTime;
        uint64 endTime;
        Status status;
    }

    struct CreditRequest {
        uint256 amount;
        string serialNumber;
    }

    enum Status {
        Pending, // 0
        Rejected, // 1
        Confirmed // 2
    }

    mapping(uint256 => BatchData) public batchData;
    mapping(address => mapping(uint256 => uint256)) public allowances;
    mapping(address => mapping(uint256 => CreditRequest)) public creditRequests;
    mapping(uint256 => string[]) public tokenSerials;

    // Create the batch data for a particular tokenID
    function createBatch(
        uint256 tokenId,
        string memory projectId,
        uint256 maxQuantity,
        uint64 startTime,
        uint64 endTime,
        string memory standard,
        string memory methodology,
        string memory region
    ) public {
        batchData[tokenId] = BatchData(
            projectId,
            standard,
            methodology,
            region,
            maxQuantity,
            startTime,
            endTime,
            Status.Pending
        );
        emit BatchCreated(msg.sender, tokenId, startTime, endTime, projectId);
    }

    // Accept or reject the batch data
    function verifyBatch(uint256 tokenId, Status _status) public onlyRole(VERIFIER_ROLE) {
        batchData[tokenId].status = _status;
        emit BatchVerified(msg.sender, tokenId, uint256(_status));
    }

    // Request to mint a certain amount of carbon credits for a particular tokenID
    // Submits the serial number and amount which are verified against the registry
    function requestCredits(
        uint256 tokenId,
        uint256 amount,
        string memory serialNumber
    ) public {
        require(creditRequests[msg.sender][tokenId].amount == 0, "Already requested credits for this batch");
        creditRequests[msg.sender][tokenId] = CreditRequest(amount, serialNumber);
        emit CreditsRequested(msg.sender, tokenId, amount, serialNumber);
    }

    // Verifier checks the serial number and amount against the registry and approves
    // Approving gives the user the ability to mint the credits and stores the serial number
    function approveCredits(
        uint256 tokenId,
        address _address
    ) public onlyRole(VERIFIER_ROLE) {
        allowances[_address][tokenId] = creditRequests[_address][tokenId].amount;
        tokenSerials[tokenId].push(creditRequests[_address][tokenId].serialNumber);
        delete creditRequests[_address][tokenId];
        emit CreditsApproved(msg.sender, _address, tokenId, creditRequests[_address][tokenId].serialNumber);
    }

    // Verifier checks the serial number and amount against the registry and rejects
    function rejectCredits(
        uint256 tokenId,
        address _address
    ) public onlyRole(VERIFIER_ROLE) {
        delete creditRequests[_address][tokenId];
        emit CreditsRejected(msg.sender, _address, tokenId, creditRequests[_address][tokenId].serialNumber);
    }

    function setURI(string memory newuri) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function mint(
        uint256 id,
        uint256 amount
    ) public {
        require(allowances[msg.sender][id] >= amount, "Not enough credits");
        allowances[msg.sender][id] -= amount;
        _mint(msg.sender, id, amount, "");
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    )
        internal
        override(ERC1155Upgradeable, ERC1155SupplyUpgradeable)
        whenNotPaused
    {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    // The following functions are overrides required by Solidity.

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

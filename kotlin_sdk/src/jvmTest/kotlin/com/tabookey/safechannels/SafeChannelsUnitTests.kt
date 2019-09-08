package com.tabookey.safechannels

import com.tabookey.duplicated.VaultParticipantTuple
import com.tabookey.duplicated.VaultPermissions
import com.tabookey.foundation.InteractorsFactory
import com.tabookey.safechannels.addressbook.SafechannelContact
import com.tabookey.safechannels.platforms.VaultFactoryContractInteractor
import com.tabookey.safechannels.vault.LocalChangeType
import com.tabookey.safechannels.vault.VaultStorageInterface
import org.junit.Before
import org.mockito.Mockito
import org.mockito.Mockito.*
import org.web3j.crypto.Credentials
import org.web3j.protocol.Web3j
import kotlin.test.Test
import kotlin.test.assertEquals

class SafeChannelsUnitTests {

    // From: https://medium.com/@elye.project/befriending-kotlin-and-mockito-1c2e7b0ef791
    // Mockito does not know about Kotlin's nullable types
    private fun <T> any() = Mockito.any() as T

    val anyAddress = "0xd216153c06e857cd7f72665e0af1d7d82172f494"

    private lateinit var vaultFactoryContractInteractor: VaultFactoryContractInteractor
    private lateinit var storage: VaultStorageInterface
    private lateinit var interactorsFactory: InteractorsFactory
    private lateinit var sdk: SafeChannels
    private lateinit var web3j: Web3j
    private lateinit var credentials: Credentials


    @Before
    fun before() {
        storage = spy(InMemoryStorage())
        web3j = mock(Web3j::class.java)
        credentials = mock(Credentials::class.java)
        vaultFactoryContractInteractor = spy(VaultFactoryContractInteractor("", web3j, credentials))
        interactorsFactory = spy(InteractorsFactory(web3j))
        sdk = SafeChannels(interactorsFactory, vaultFactoryContractInteractor, storage)
    }


    @Test
    fun `should create a new keypair and store it`() {
        var ownedAccounts = sdk.listAllOwnedAccounts()
        reset(storage)
        assertEquals(0, ownedAccounts.size)
        val account = sdk.createKeypair()
        verify(storage).generateKeypair()
        ownedAccounts = sdk.listAllOwnedAccounts()
        verify(storage).getAllOwnedAccounts()
        assertEquals(1, ownedAccounts.size)
        assertEquals(account, ownedAccounts[0])
    }

    @Test
    fun `should create a new vault and save it in the storage`() {
        // There are no vaults in the SDK
        var allVaults = sdk.listAllVaults()
        assertEquals(0, allVaults.size)
        verify(storage, never()).putVaultState(any())
        val kredentials = sdk.createKeypair()
        val vaultConfigBuilder = sdk.vaultConfigBuilder(kredentials.getAddress())
        verify(storage, times(1)).putVaultState(any())
        // One vault was created
        allVaults = sdk.listAllVaults()
        assertEquals(1, allVaults.size)
        val localChanges = vaultConfigBuilder.getVaultLocalState().localChanges
        assertEquals(2, localChanges.size)
        assertEquals(LocalChangeType.INITIALIZE, localChanges[0].changeType)

        // The data is accessible from a new object that holds the same storage instance
        // TODO: need to replace the in-memory storage with something file-based. In-memory one keeps references to objects so this is not testing much.
        val tempSdk = SafeChannels(interactorsFactory, vaultFactoryContractInteractor, storage)
        val tempLocalChanges = tempSdk.listAllVaults()[0].getVaultLocalState().localChanges
        assertEquals(2, tempLocalChanges.size)
        assertEquals(LocalChangeType.INITIALIZE, tempLocalChanges[0].changeType)
    }

    @Test
    fun `should save new entries in the address book`() {
        val addressBook = sdk.getAddressBook()
        // There are no entries in the address book
        var addresses = addressBook.getAllEntities()
        assertEquals(0, addresses.size)

        // cannot store addresses with no relation to some vault
        val kredentials = sdk.createKeypair()
        val builder = sdk.vaultConfigBuilder(kredentials.getAddress())
        val contact = SafechannelContact("guid, shmuid", "Contact One")
        contact.addParticipantTuple(builder.vaultState.id!!, VaultParticipantTuple(VaultPermissions.ADMIN_PERMISSIONS, 2, anyAddress))
        addressBook.addNewContact(contact)
        verify(storage, times(1)).putAddressBookEntry(any())
        addresses = addressBook.getAllEntities()
        assertEquals(1, addresses.size)

    }

    @Test
    fun `should configure and deploy vault to the blockchain with correct configuration`() {
        val kredentials = sdk.createKeypair()
        val vaultConfigBuilder = sdk.vaultConfigBuilder(kredentials.getAddress())
        val contact = SafechannelContact("guid, shmuid", "Contact One")
        val id = vaultConfigBuilder.vaultState.id
        contact.addParticipantTuple(id!!, VaultParticipantTuple(VaultPermissions.ADMIN_PERMISSIONS, 2, anyAddress))
        val adminPermissions = VaultPermissions.ADMIN_PERMISSIONS
        adminPermissions.addPermission(VaultPermissions.Permission.canSpend) // Note: this should not work with the current contract
        val participant = contact.participantTuples[id]!![0].address
        vaultConfigBuilder.addParticipant(participant, adminPermissions)
        // TODO: maybe it should not allow creation of new builder if no account is created

        // Local state corresponds to the expected state
        val localChanges = sdk.listAllVaults()[0].getVaultLocalState().localChanges
        assertEquals(3, localChanges.size)
        val initializeChange = localChanges[0]
        val changeOwnerChange = localChanges[1]
        val addParticipantChange = localChanges[2]

        assertEquals(LocalChangeType.INITIALIZE, initializeChange.changeType)

        assertEquals(LocalChangeType.CHOWN, changeOwnerChange.changeType)

        assertEquals(LocalChangeType.ADD_PARTICIPANT, addParticipantChange.changeType)
        assertEquals(anyAddress, addParticipantChange.participant)
        assertEquals(adminPermissions, addParticipantChange.permissions)
    }

    @Test
    fun `should deploy the vault with the corresponding configuration`() {
        val kredentials = sdk.createKeypair()
        val vaultConfigBuilder = sdk.vaultConfigBuilder(kredentials.getAddress())
        val deployedVault = vaultConfigBuilder.deployVault()

        val allVaults = sdk.listAllVaults()
        assertEquals(1, allVaults.size)
        assertEquals(allVaults[0].vaultState.id, deployedVault.vaultState.id)

    }
}
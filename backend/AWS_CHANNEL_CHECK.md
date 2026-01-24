# How to Check Channels on AWS Instance

## Option 1: Using the Network Script (Easiest)

If you're using the test-network setup, navigate to the test-network directory:

```bash
cd ~/fabric/fabric-samples/test-network
```

Then use the network script which automatically sets up the environment:

```bash
# Check if network is running
docker ps

# If network is running, you can check channels using the script
# The network.sh script sets up all environment variables automatically
```

## Option 2: Set Environment Variables Manually

If you need to run peer commands directly, you need to set up the environment:

```bash
# Navigate to your network directory (where organizations folder is)
cd ~/fabric/fabric-samples/test-network

# Set the fabric config path
export FABRIC_CFG_PATH=$PWD/../config

# Set peer environment variables for Org1
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=$PWD/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=$PWD/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Now you can run peer commands
peer channel list
```

## Option 3: Check via Docker Containers

If your network is running in Docker containers, you can exec into the peer container:

```bash
# List running containers
docker ps

# Exec into the peer container (replace container name if different)
docker exec -it peer0.org1.example.com peer channel list

# Or check channel info
docker exec -it peer0.org1.example.com peer channel getinfo -c mychannel
docker exec -it peer0.org1.example.com peer channel getinfo -c doorchannel
```

## Option 4: Check Docker Logs

You can also check the network setup logs to see what channel was created:

```bash
# Check if network was started and what channel was created
docker logs peer0.org1.example.com | grep -i channel

# Or check orderer logs
docker logs orderer.example.com | grep -i channel
```

## Finding Your Channel Name

The channel name is usually set when you create the network. Common names:
- `mychannel` (default test-network channel)
- `doorchannel` (if you used the custom name from the setup)

To find out what channel exists, check:
1. The network startup script/logs
2. Docker container logs
3. The channel creation command you used

## Quick Check Commands

```bash
# Check if network is running
docker ps | grep peer
docker ps | grep orderer

# Check channel via docker exec (most reliable)
docker exec peer0.org1.example.com peer channel list

# If that works, get channel info
docker exec peer0.org1.example.com peer channel getinfo -c mychannel
# or
docker exec peer0.org1.example.com peer channel getinfo -c doorchannel
```


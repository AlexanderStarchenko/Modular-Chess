/**
 * Tests for Network Synchronization (NTP-like)
 */

describe('Network Time Synchronization', () => {
    let clientTime, serverTime, receiveTime;

    test('Should calculate correct offset and RTT', () => {
        // T1: Client sends ping
        clientTime = 1000;
        // T2: Server receives (after 50ms)
        serverTime = 1050 + 10; // Server is 10ms ahead
        // T3: Client receives (after another 50ms)
        receiveTime = 1100;

        const rtt = receiveTime - clientTime;
        const networkOffset = serverTime - (clientTime + receiveTime) / 2;

        expect(rtt).toBe(100);
        expect(networkOffset).toBe(10);
    });

    test('Should handle negative offset (client ahead)', () => {
        clientTime = 1000;
        serverTime = 1050 - 20; // Server is 20ms behind
        receiveTime = 1100;

        const networkOffset = serverTime - (clientTime + receiveTime) / 2;
        expect(networkOffset).toBe(-20);
    });
});

/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from "react";
// eslint-disable-next-line deprecate/import
import { mount, ReactWrapper } from "enzyme";
import { act } from "react-dom/test-utils";
import { MatrixClient, MatrixEvent, Room, RoomMember, getBeaconInfoIdentifier } from "matrix-js-sdk/src/matrix";
import * as maplibregl from "maplibre-gl";
import { mocked } from "jest-mock";

import BeaconViewDialog from "../../../../src/components/views/beacon/BeaconViewDialog";
import {
    findByAttr,
    findByTestId,
    getMockClientWithEventEmitter,
    makeBeaconEvent,
    makeBeaconInfoEvent,
    makeRoomWithBeacons,
    makeRoomWithStateEvents,
} from "../../../test-utils";
import { TILE_SERVER_WK_KEY } from "../../../../src/utils/WellKnownUtils";
import { OwnBeaconStore } from "../../../../src/stores/OwnBeaconStore";
import { BeaconDisplayStatus } from "../../../../src/components/views/beacon/displayStatus";
import BeaconListItem from "../../../../src/components/views/beacon/BeaconListItem";

describe("<BeaconViewDialog />", () => {
    // 14.03.2022 16:15
    const now = 1647270879403;
    // stable date for snapshots
    jest.spyOn(global.Date, "now").mockReturnValue(now);
    const roomId = "!room:server";
    const aliceId = "@alice:server";
    const bobId = "@bob:server";

    const aliceMember = new RoomMember(roomId, aliceId);

    const mockClient = getMockClientWithEventEmitter({
        getClientWellKnown: jest.fn().mockReturnValue({
            [TILE_SERVER_WK_KEY.name]: { map_style_url: "maps.com" },
        }),
        getUserId: jest.fn().mockReturnValue(bobId),
        getRoom: jest.fn(),
        isGuest: jest.fn().mockReturnValue(false),
        getVisibleRooms: jest.fn().mockReturnValue([]),
    });

    const mapOptions = { container: {} as unknown as HTMLElement, style: "" };
    const mockMap = new maplibregl.Map(mapOptions);

    // make fresh rooms every time
    // as we update room state
    const setupRoom = (stateEvents: MatrixEvent[] = []): Room => {
        const room1 = makeRoomWithStateEvents(stateEvents, { roomId, mockClient });
        jest.spyOn(room1, "getMember").mockReturnValue(aliceMember);

        return room1;
    };

    const defaultEvent = makeBeaconInfoEvent(aliceId, roomId, { isLive: true }, "$alice-room1-1");

    const location1 = makeBeaconEvent(aliceId, {
        beaconInfoId: defaultEvent.getId(),
        geoUri: "geo:51,41",
        timestamp: now + 1,
    });

    const defaultProps = {
        onFinished: jest.fn(),
        roomId,
        matrixClient: mockClient as MatrixClient,
    };

    const getComponent = (props = {}) => mount(<BeaconViewDialog {...defaultProps} {...props} />);

    const openSidebar = (component: ReactWrapper) =>
        act(() => {
            findByTestId(component, "beacon-view-dialog-open-sidebar").at(0).simulate("click");
            component.setProps({});
        });

    beforeEach(() => {
        jest.spyOn(OwnBeaconStore.instance, "getLiveBeaconIds").mockRestore();
        jest.spyOn(OwnBeaconStore.instance, "getBeaconById").mockRestore();
        jest.spyOn(global.Date, "now").mockReturnValue(now);
        jest.clearAllMocks();
    });

    it("renders a map with markers", () => {
        const room = setupRoom([defaultEvent]);
        const beacon = room.currentState.beacons.get(getBeaconInfoIdentifier(defaultEvent))!;
        beacon.addLocations([location1]);
        const component = getComponent();
        expect(component.find("Map").props()).toEqual(
            expect.objectContaining({
                centerGeoUri: "geo:51,41",
                interactive: true,
            }),
        );
        expect(component.find("SmartMarker").length).toEqual(1);
    });

    it("does not render any own beacon status when user is not live sharing", () => {
        // default event belongs to alice, we are bob
        const room = setupRoom([defaultEvent]);
        const beacon = room.currentState.beacons.get(getBeaconInfoIdentifier(defaultEvent))!;
        beacon.addLocations([location1]);
        const component = getComponent();
        expect(component.find("DialogOwnBeaconStatus").html()).toBeNull();
    });

    it("renders own beacon status when user is live sharing", () => {
        // default event belongs to alice
        const room = setupRoom([defaultEvent]);
        const beacon = room.currentState.beacons.get(getBeaconInfoIdentifier(defaultEvent))!;
        beacon.addLocations([location1]);
        // mock own beacon store to show default event as alice's live beacon
        jest.spyOn(OwnBeaconStore.instance, "getLiveBeaconIds").mockReturnValue([beacon.identifier]);
        jest.spyOn(OwnBeaconStore.instance, "getBeaconById").mockReturnValue(beacon);
        const component = getComponent();
        expect(component.find("MemberAvatar").length).toBeTruthy();
        expect(component.find("OwnBeaconStatus").props()).toEqual({
            beacon,
            displayStatus: BeaconDisplayStatus.Active,
            className: "mx_DialogOwnBeaconStatus_status",
        });
    });

    it("updates markers on changes to beacons", () => {
        const room = setupRoom([defaultEvent]);
        const beacon = room.currentState.beacons.get(getBeaconInfoIdentifier(defaultEvent))!;
        beacon.addLocations([location1]);
        const component = getComponent();
        expect(component.find("BeaconMarker").length).toEqual(1);

        const anotherBeaconEvent = makeBeaconInfoEvent(bobId, roomId, { isLive: true }, "$bob-room1-1");

        act(() => {
            // emits RoomStateEvent.BeaconLiveness
            room.currentState.setStateEvents([anotherBeaconEvent]);
        });

        component.setProps({});

        // two markers now!
        expect(component.find("BeaconMarker").length).toEqual(2);
    });

    it("does not update bounds or center on changing beacons", () => {
        const room = setupRoom([defaultEvent]);
        const beacon = room.currentState.beacons.get(getBeaconInfoIdentifier(defaultEvent))!;
        beacon.addLocations([location1]);
        const component = getComponent();
        expect(component.find("BeaconMarker").length).toEqual(1);

        const anotherBeaconEvent = makeBeaconInfoEvent(bobId, roomId, { isLive: true }, "$bob-room1-1");

        act(() => {
            // emits RoomStateEvent.BeaconLiveness
            room.currentState.setStateEvents([anotherBeaconEvent]);
        });

        component.setProps({});

        // two markers now!
        expect(mockMap.setCenter).toHaveBeenCalledTimes(1);
        expect(mockMap.fitBounds).toHaveBeenCalledTimes(1);
    });

    it("renders a fallback when there are no locations", () => {
        // this is a cornercase, should not be a reachable state in UI anymore
        const onFinished = jest.fn();
        const room = setupRoom([defaultEvent]);
        room.currentState.beacons.get(getBeaconInfoIdentifier(defaultEvent));
        const component = getComponent({ onFinished });

        // map placeholder
        expect(findByTestId(component, "beacon-view-dialog-map-fallback")).toMatchSnapshot();

        act(() => {
            findByTestId(component, "beacon-view-dialog-fallback-close").at(0).simulate("click");
        });

        expect(onFinished).toHaveBeenCalled();
    });

    it("renders map without markers when no live beacons remain", () => {
        const onFinished = jest.fn();
        const room = setupRoom([defaultEvent]);
        const beacon = room.currentState.beacons.get(getBeaconInfoIdentifier(defaultEvent))!;
        beacon.addLocations([location1]);
        const component = getComponent({ onFinished });
        expect(component.find("BeaconMarker").length).toEqual(1);

        // this will replace the defaultEvent
        // leading to no more live beacons
        const anotherBeaconEvent = makeBeaconInfoEvent(aliceId, roomId, { isLive: false }, "$alice-room1-2");

        expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 51, lon: 41 });
        // reset call counts
        mocked(mockMap.setCenter).mockClear();
        mocked(mockMap.fitBounds).mockClear();

        act(() => {
            // emits RoomStateEvent.BeaconLiveness
            room.currentState.setStateEvents([anotherBeaconEvent]);
        });

        component.setProps({});

        // no more avatars
        expect(component.find("MemberAvatar").length).toBeFalsy();
        // map still rendered
        expect(component.find("Map").length).toBeTruthy();
        // map location unchanged
        expect(mockMap.setCenter).not.toHaveBeenCalled();
        expect(mockMap.fitBounds).not.toHaveBeenCalled();
    });

    describe("sidebar", () => {
        it("opens sidebar on view list button click", () => {
            const room = setupRoom([defaultEvent]);
            const beacon = room.currentState.beacons.get(getBeaconInfoIdentifier(defaultEvent))!;
            beacon.addLocations([location1]);
            const component = getComponent();

            openSidebar(component);

            expect(component.find("DialogSidebar").length).toBeTruthy();
        });

        it("closes sidebar on close button click", () => {
            const room = setupRoom([defaultEvent]);
            const beacon = room.currentState.beacons.get(getBeaconInfoIdentifier(defaultEvent))!;
            beacon.addLocations([location1]);
            const component = getComponent();

            // open the sidebar
            openSidebar(component);

            expect(component.find("DialogSidebar").length).toBeTruthy();

            // now close it
            act(() => {
                findByAttr("data-testid")(component, "dialog-sidebar-close").at(0).simulate("click");
                component.setProps({});
            });

            expect(component.find("DialogSidebar").length).toBeFalsy();
        });
    });

    describe("focused beacons", () => {
        const beacon2Event = makeBeaconInfoEvent(bobId, roomId, { isLive: true }, "$bob-room1-2");

        const location2 = makeBeaconEvent(bobId, {
            beaconInfoId: beacon2Event.getId(),
            geoUri: "geo:33,22",
            timestamp: now + 1,
        });

        const fitBoundsOptions = { maxZoom: 15, padding: 100 };

        it("opens map with both beacons in view on first load without initialFocusedBeacon", () => {
            const [beacon1, beacon2] = makeRoomWithBeacons(
                roomId,
                mockClient,
                [defaultEvent, beacon2Event],
                [location1, location2],
            );

            getComponent({ beacons: [beacon1, beacon2] });

            // start centered on mid point between both beacons
            expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 42, lon: 31.5 });
            // only called once
            expect(mockMap.setCenter).toHaveBeenCalledTimes(1);
            // bounds fit both beacons, only called once
            expect(mockMap.fitBounds).toHaveBeenCalledWith(
                new maplibregl.LngLatBounds([22, 33], [41, 51]),
                fitBoundsOptions,
            );
            expect(mockMap.fitBounds).toHaveBeenCalledTimes(1);
        });

        it("opens map with both beacons in view on first load with an initially focused beacon", () => {
            const [beacon1, beacon2] = makeRoomWithBeacons(
                roomId,
                mockClient,
                [defaultEvent, beacon2Event],
                [location1, location2],
            );

            getComponent({ beacons: [beacon1, beacon2], initialFocusedBeacon: beacon1 });

            // start centered on initialFocusedBeacon
            expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 51, lon: 41 });
            // only called once
            expect(mockMap.setCenter).toHaveBeenCalledTimes(1);
            // bounds fit both beacons, only called once
            expect(mockMap.fitBounds).toHaveBeenCalledWith(
                new maplibregl.LngLatBounds([22, 33], [41, 51]),
                fitBoundsOptions,
            );
            expect(mockMap.fitBounds).toHaveBeenCalledTimes(1);
        });

        it("focuses on beacon location on sidebar list item click", () => {
            const [beacon1, beacon2] = makeRoomWithBeacons(
                roomId,
                mockClient,
                [defaultEvent, beacon2Event],
                [location1, location2],
            );

            const component = getComponent({ beacons: [beacon1, beacon2] });

            // reset call counts on map mocks after initial render
            jest.clearAllMocks();

            openSidebar(component);

            act(() => {
                // click on the first beacon in the list
                component.find(BeaconListItem).at(0).simulate("click");
            });

            // centered on clicked beacon
            expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 51, lon: 41 });
            // only called once
            expect(mockMap.setCenter).toHaveBeenCalledTimes(1);
            // bounds fitted just to clicked beacon
            expect(mockMap.fitBounds).toHaveBeenCalledWith(
                new maplibregl.LngLatBounds([41, 51], [41, 51]),
                fitBoundsOptions,
            );
            expect(mockMap.fitBounds).toHaveBeenCalledTimes(1);
        });

        it("refocuses on same beacon when clicking list item again", () => {
            // test the map responds to refocusing the same beacon
            const [beacon1, beacon2] = makeRoomWithBeacons(
                roomId,
                mockClient,
                [defaultEvent, beacon2Event],
                [location1, location2],
            );

            const component = getComponent({ beacons: [beacon1, beacon2] });

            // reset call counts on map mocks after initial render
            jest.clearAllMocks();

            openSidebar(component);

            act(() => {
                // click on the second beacon in the list
                component.find(BeaconListItem).at(1).simulate("click");
            });

            const expectedBounds = new maplibregl.LngLatBounds([22, 33], [22, 33]);

            // date is mocked but this relies on timestamp, manually mock a tick
            jest.spyOn(global.Date, "now").mockReturnValue(now + 1);

            act(() => {
                // click on the second beacon in the list
                component.find(BeaconListItem).at(1).simulate("click");
            });

            // centered on clicked beacon
            expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 33, lon: 22 });
            // bounds fitted just to clicked beacon
            expect(mockMap.fitBounds).toHaveBeenCalledWith(expectedBounds, fitBoundsOptions);
            // each called once per click
            expect(mockMap.setCenter).toHaveBeenCalledTimes(2);
            expect(mockMap.fitBounds).toHaveBeenCalledTimes(2);
        });
    });
});

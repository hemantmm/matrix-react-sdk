/*
Copyright 2017-2021 The Matrix.org Foundation C.I.C.

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

import { Store } from "flux/utils";

import { Action } from "../dispatcher/actions";
import dis from "../dispatcher/dispatcher";
import { ActionPayload } from "../dispatcher/payloads";
import { DoAfterSyncPreparedPayload } from "../dispatcher/payloads/DoAfterSyncPreparedPayload";

interface IState {
    deferredAction: ActionPayload | null;
}

const INITIAL_STATE: IState = {
    deferredAction: null,
};

/**
 * A class for storing application state to do with authentication. This is a simple flux
 * store that listens for actions and updates its state accordingly, informing any
 * listeners (views) of state changes.
 */
class LifecycleStore extends Store<ActionPayload> {
    private state: IState = INITIAL_STATE;

    public constructor() {
        super(dis);
    }

    private setState(newState: Partial<IState>): void {
        this.state = Object.assign(this.state, newState);
        this.__emitChange();
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    protected __onDispatch(payload: ActionPayload | DoAfterSyncPreparedPayload<ActionPayload>): void {
        switch (payload.action) {
            case Action.DoAfterSyncPrepared:
                this.setState({
                    deferredAction: payload.deferred_action,
                });
                break;
            case "cancel_after_sync_prepared":
                this.setState({
                    deferredAction: null,
                });
                break;
            case "MatrixActions.sync": {
                if (payload.state !== "PREPARED") {
                    break;
                }
                if (!this.state.deferredAction) break;
                const deferredAction = Object.assign({}, this.state.deferredAction);
                this.setState({
                    deferredAction: null,
                });
                dis.dispatch(deferredAction);
                break;
            }
            case "on_client_not_viable":
            case Action.OnLoggedOut:
                this.reset();
                break;
        }
    }

    private reset(): void {
        this.state = Object.assign({}, INITIAL_STATE);
    }
}

let singletonLifecycleStore: LifecycleStore | null = null;
if (!singletonLifecycleStore) {
    singletonLifecycleStore = new LifecycleStore();
}
export default singletonLifecycleStore!;

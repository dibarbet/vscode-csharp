/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

let triggerResolve!: (value: void | PromiseLike<void>) => void;
const triggerPromise = new Promise<void>((resolve, _) => {
    triggerResolve = resolve;
});

let activatedResolve!: (value: void | PromiseLike<void>) => void;
const activatedPromise = new Promise<void>((resolve, _) => {
    activatedResolve = resolve;
});

export function triggerActivation(): void {
    triggerResolve();
}

// almost nothing needs this unless its part of the activation.
// everything else is already running as part of server start or on other vscode events registered by server start.
// probably doesn't need to be global.

export interface IActivateable {
    activate(): void;
    deferredActivate(): Promise<void>;
}

export function registerDeferredActivation(
    component: DeferredComponent,
    activationFunction: () => Promise<void>
): void {
    triggerPromise
        .then(async () => {
            await activationFunction();
        })
        .catch((error) => {
            // todo
        });
}

// maybe register deferred activations by name?
// caller can ask for a deferred activation by name - if not exists yet, creates the empty promise (resolved when registered).

export async function waitForTrigger(): Promise<void> {
    await triggerPromise;
}

export async function waitForActivated(): Promise<void> {
    await activatedPromise;
}

export type DeferredComponent = 'debugger' | 'roslyn';



/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sleep } from '../common';

/**
 * Allows integration tests to track various asynchronous operations and wait for them to complete.
 * Ideally this should be avoided and integration test APIs return promises complete and return results, but in some cases
 * we need to wait for arbitrary, unrelated operations to finish.
 * Poor mans implementation of https://sourceroslyn.io/#Microsoft.CodeAnalysis.Workspaces/Shared/TestHooks/IAsynchronousOperationListener.cs,9
 */
export interface AsynchronousOperationListener {
    waitForAllOperationsAsync(timeoutMs: number): Promise<void>;
    runAsynchronousOperation<T>(name: string, operation: () => Promise<T>): Promise<T>;
}

class NoOpAsynchronousOperationListener {
    async waitForAllOperationsAsync(_timeoutMs: number): Promise<void> {
        return;
    }

    async runAsynchronousOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
        return await operation();
    }
}

class AsynchronousOperationListenerImpl implements AsynchronousOperationListener {
    private readonly _pendingOperations: { [key: string]: Promise<any>[] } = {};

    async waitForAllOperationsAsync(timeoutMs: number): Promise<void> {
        const timeout = new Promise<never>((_, reject) => {
            setTimeout(() => {
                const names = this.getPendingOperationNames();
                reject(`Timed out waiting for operations to complete: ${names.join(', ')}`);
            }, timeoutMs);
        });
        const complete = this.waitForCompletionAsync();

        return await Promise.race([timeout, complete]);
    }

    async runAsynchronousOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
        const operationPromise = operation();
        // Keep track of the operation so we can wait for it later.
        if (this._pendingOperations[name]) {
            this._pendingOperations[name].push(operationPromise);
        } else {
            this._pendingOperations[name] = [operationPromise];
        }

        // Remove the operation from the list when it completes.
        operationPromise.then(() => {
            const pendingOperations = this._pendingOperations[name];
            const index = this._pendingOperations[name].indexOf(operationPromise);
            if (index >= 0) {
                pendingOperations.splice(index, 1);
            }
        });

        return await operationPromise;
    }

    private async waitForCompletionAsync(): Promise<void> {
        // Since the promises remove themselves when they complete, we can just wait for the pendingOperations to be empty.
        const complete = false;
        while (!complete) {
            const pendingOperationNames = this.getPendingOperationNames();
            if (pendingOperationNames.length === 0) {
                return;
            }
            await sleep(100);
        }
    }

    private getPendingOperationNames(): string[] {
        const pendingOperationNames = Object.entries(this._pendingOperations)
            .filter(([_k, v]) => v.length > 0)
            .map(([k, _v]) => k);
        return pendingOperationNames;
    }
}

export const asynchronousOperationListener: AsynchronousOperationListener =
    process.env.RUNNING_INTEGRATION_TESTS === 'true'
        ? new AsynchronousOperationListenerImpl()
        : new NoOpAsynchronousOperationListener();

// Copyright (c) 2024, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import path from 'path';

import type {ParseFiltersAndOutputOptions} from '../../types/features/filters.interfaces.js';
import {BaseCompiler} from '../base-compiler.js';

import {WasmerParser} from './argument-parsers.js';
import {ExecutionOptions} from '../../types/compilation/compilation.interfaces.js';

export class WasmerCompiler extends BaseCompiler {
    static get key() {
        return 'wasmer';
    }

    wasmFilename(inputFilename: string) {
        return inputFilename.replace(/\.wat$/, '.wasm');
    }

    override optionsForFilter(filters: ParseFiltersAndOutputOptions, outputFilename: string, userOptions?: string[]) {
        filters.binary = true;
        return ['-o', this.filename(outputFilename)];
    }

    override orderArguments(
        options: string[],
        inputFilename: string,
        libIncludes: string[],
        libOptions: string[],
        libPaths: string[],
        libLinks: string[],
        userOptions: string[],
        staticLibLinks: string[],
    ): string[] {
        return ['create-obj']
            .concat(options)
            .concat(libIncludes, libOptions, libPaths, libLinks, userOptions, staticLibLinks)
            .concat(this.wasmFilename(inputFilename));
    }

    override getOutputFilename(dirPath: string, outputFilebase: string): string {
        return path.join(dirPath, `${outputFilebase}.obj`);
    }

    override getArgumentParser() {
        return WasmerParser;
    }

    override getSharedLibraryPathsAsArguments() {
        // Wasmer does not have an equivalent to -Wl,-rpath in its driver, return
        // an empty list.
        return [];
    }

    override async runCompiler(
        compiler: string,
        options: string[],
        inputFilename: string,
        execOptions: ExecutionOptions & {env: Record<string, string>},
    ) {
        if (!execOptions) {
            execOptions = this.getDefaultExecOptions();
        }

        // Wasmer does not support .wat files in the `create-obj` subcommand.
        // To work around this we run `wat2wasm` and then compile the resulting
        // .wasm file.

        // Find wat2wasm
        const wat2wasm = this.possibleTools.find(t => t.id == 'wat2wasm');
        if (!wat2wasm) {
            throw new Error('wat2wasm not found');
        }

        const watFilename = inputFilename;
        const wasmFilename = this.wasmFilename(inputFilename);
        const outputFilename = this.getOutputFilename(path.dirname(inputFilename), this.outputFilebase);

        const compilationInfo = {
            compiler: {
                lang: 'wasm',
            },
        };
        await wat2wasm.runTool(compilationInfo, watFilename, ['-o', wasmFilename]);

        // Now run the compiler on the wasm file
        return super.runCompiler(compiler, options, wasmFilename, execOptions);
    }
}

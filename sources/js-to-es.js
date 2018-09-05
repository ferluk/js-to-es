/**
 * @file The threejs convertor
 *
 * @author Itee <valcketristan@gmail.com>
 * @license MIT
 */

import {
    readdirSync,
    statSync,
    writeFileSync
} from 'fs'
import {
    sep,
    extname,
    basename,
    dirname,
    relative,
    resolve,
    join
} from 'path'
import {
    isString,
    isNotString,
    isArrayOfString,
    fileNotExistForPath,
    getUncommentedFileForPath,
    createFoldersTree,
    makeUnique
} from './utils'

/**
 * Extend the String prototype if contains not exist.
 * It allow to check if the string contains or not a target string
 *
 * @type {Function}
 * @param {string} target - The string to match in current string
 * @return {boolean}
 */
String.prototype.contains = String.prototype.contains || function ( target ) { return this.indexOf( target ) > -1 }

class JsToEs {

    static JavascriptType = Object.freeze( {
        AMD:       'AMD',
        CJS:       'CJS',
        Classic:   'Classic',
        Es6:       'Es6',
        Library:   'Library',
        Prototype: 'Prototype',
        UMD:       'UMD',
        Unknown:   'Unknown'
    } )

    constructor ( options = {} ) {

        // Public
        this.inputs    = options.inputs || [ '' ]
        this.excludes  = options.excludes || [ '' ]
        this.output    = options.output || ''
        this.edgeCases = options.edgeCases || []
        this.banner    = options.banner || ''
        this.global    = options.global || ''

        // Private
        this._exportMap = {}
        this._fileMap   = {}
        this._regex     = {
            'AMD':       new RegExp( /define\.amd/g ),
            'CJS':       new RegExp( /module\.exports\s*=\s*\{?[^}]*}?/g ),
            'UMD':       new RegExp( /\(function\s*\(root,\s*factory\)\s*\{/g ),
            'Classic':   new RegExp( `(${this._global}.(\\w+)\\s*=\\s*)+\\s*function`, 'g' ),
            'Prototype': new RegExp( `prototype\\.constructor\\s?=\\s?(${this._global}\\.)?(\\w)+`, 'g' ),
            'Library':   new RegExp( `${this._global}.(\\w+) = \\{` ),
            'Es6':       new RegExp( /(export\s(default|var))|((import|export)[\r\n\s]*(default)?({[\w\s,]+}\s?(from)?))/, 'g' )
        }

    }

    get inputs () {
        return this._inputs
    }

    set inputs ( value ) {

        if ( isArrayOfString( value ) ) {

            this._inputs = value

        } else if ( isString( value ) ) {

            this._inputs = [ value ]

        } else {

            throw new TypeError( 'Invalid inputs arguments, expected a String or Array of String' )

        }

    }

    get excludes () {
        return this._excludes
    }

    set excludes ( value ) {

        if ( isArrayOfString( value ) ) {

            this._excludes = value

        } else if ( isString( value ) ) {

            this._excludes = [ value ]

        } else {

            throw new TypeError( 'Invalid excludes arguments, expected a String or Array of String' )

        }

        return this

    }

    get output () {
        return this._output
    }

    set output ( value ) {

        if ( isString( value ) ) {

            this._output = value

        } else {

            throw new TypeError( 'Invalid output arguments, expected a String' )

        }

        return this

    }

    get edgeCases () {
        return this._edgeCases
    }

    set edgeCases ( value ) {

        // Todo: object edge case or validate object structure of input value here !
        this._edgeCases = value

    }

    get banner () {
        return this._banner
    }

    set banner ( value ) {

        if ( isNotString( value ) ) { throw new TypeError( 'Invalid banner argument, expect a string.' )}

        this._banner = value
    }

    get global () {
        return this._banner
    }

    set global ( value ) {

        if ( isNotString( value ) ) { throw new TypeError( 'Invalid global argument, expect a string.' )}

        // global will be used in regex so escape it
        // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
        this._global = value.replace( /[-\/\\^$*+?.()|[\]{}]/g, '\\$&' )
        this._regex  = {
            'AMD':       new RegExp( /define\.amd/g ),
            'CJS':       new RegExp( /module\.exports\s*=\s*\{?[^}]*}?/g ),
            'UMD':       new RegExp( /\(function\s*\(root,\s*factory\)\s*\{/g ),
            'Classic':   new RegExp( `(${this._global}.(\\w+)\\s*=\\s*)+\\s*function`, 'g' ),
            'Prototype': new RegExp( `prototype\\.constructor\\s?=\\s?(${this._global}\\.)?(\\w)+`, 'g' ),
            'Library':   new RegExp( `${this._global}.(\\w+) = \\{` ),
            'Es6':       new RegExp( /(export\s(default|var))|((import|export)[\r\n\s]*(default)?({[\w\s,]+}\s?(from)?))/, 'g' )
        }

    }

    get exportMap () {
        return this._exportMap
    }

    get fileMap () {
        return this._fileMap
    }

    /**
     * Return all the files paths under filePaths in a recursive way.
     *
     * @param filePaths - An array of string, representing the base path where looking for get all files paths
     * @return {Array.<string>} - An array of files paths
     * @private
     */
    static _getFilesPathsUnder ( filePaths ) {

        let files = []

        if ( Array.isArray( filePaths ) ) {

            let filePath = undefined
            for ( let pathIndex = 0, numberOfPaths = filePaths.length ; pathIndex < numberOfPaths ; pathIndex++ ) {

                filePath      = filePaths[ pathIndex ]
                const results = JsToEs._checkStateOf( filePath )
                Array.prototype.push.apply( files, results )

            }

        } else {

            const results = JsToEs._checkStateOf( filePaths )
            Array.prototype.push.apply( files, results )

        }

        return files

    }

    static _getFilesPathsUnderFolder ( folder ) {

        const files = []

        readdirSync( folder ).forEach( ( name ) => {

            const filePath = resolve( folder, name )
            const results  = JsToEs._checkStateOf( filePath )
            Array.prototype.push.apply( files, results )

        } )

        return files

    }

    static _checkStateOf ( filePath ) {

        if ( fileNotExistForPath( filePath ) ) {
            throw new ReferenceError( `Invalid file path "${filePath}".` )
        }

        const stats = statSync( filePath )
        if ( stats.isFile() ) {

            return [ filePath ]

        } else if ( stats.isDirectory() ) {

            return JsToEs._getFilesPathsUnderFolder( filePath )

        } else {

            throw new ReferenceError( `Invalid stats file object.` )

        }

    }

    /**
     * Will filter file paths an keep only js files
     *
     * @param {Array.<string>} filePaths - An array of path to filter
     * @return {Array.<string>} The filtered path with only javascript files
     * @private
     */
    static _filterJavascriptFiles ( filePaths ) {

        let filteredFilesPath = []

        let filePath = undefined
        for ( let filePathIndex = 0, numberOfFilePaths = filePaths.length ; filePathIndex < numberOfFilePaths ; filePathIndex++ ) {

            filePath = filePaths[ filePathIndex ]

            // Not a js file like fonts or shaders
            const fileExtension = extname( filePath )
            if ( fileExtension !== '.js' ) {
                //            console.log( 'Not Js:  ' + filePath )
                continue
            }

            filteredFilesPath.push( filePath )

        }

        return filteredFilesPath

    }

    /**
     * Will create an array without the strings in filePaths that are matched in excludes paths
     *
     * @param {Array.<string>} filePaths - An array of string to clean
     * @param {Array.<string>} excludes - The paths to remove
     * @return {Array.<string>} The cleaned filePaths of excludes paths
     * @private
     */
    static _excludesFilesPaths ( filePaths, excludes ) {

        let filteredFilesPath = []

        let filePath = undefined
        for ( let filePathIndex = 0, numberOfFilePaths = filePaths.length ; filePathIndex < numberOfFilePaths ; filePathIndex++ ) {
            filePath = filePaths[ filePathIndex ]

            if ( JsToEs._isExclude( filePath, excludes ) ) {
                //            console.log( 'Exclude: ' + filePath )
                continue
            }

            filteredFilesPath.push( filePath )

        }

        return filteredFilesPath

    }

    static _isExclude ( path, excludes ) {

        let isExclude      = false
        let excludePattern = undefined
        for ( let i = 0, pathLength = excludes.length ; i < pathLength ; i++ ) {

            excludePattern = excludes[ i ]

            if ( excludePattern.length === 0 ) {
                continue
            }

            // In case this is a file name it must fully match
            if ( excludePattern.indexOf( '.' ) > -1 ) {

                const fileName = path.replace( /^.*(\\|\/|\:)/, '' )
                if ( fileName === excludePattern ) {
                    isExclude = true
                }

            } else if ( path.contains( excludePattern ) ) {
                isExclude = true
            }

        }

        return isExclude

    }

    static _getFileType ( file, regex ) {

        const es6Match = file.match( regex[ JsToEs.JavascriptType.Es6 ] )
        if ( es6Match && es6Match.length > 0 ) {
            return JsToEs.JavascriptType.Es6
        }

        const amdMatch = file.match( regex[ JsToEs.JavascriptType.AMD ] )
        if ( amdMatch && amdMatch.length > 0 ) {
            return JsToEs.JavascriptType.AMD
        }

        const cjsMatch = file.match( regex[ JsToEs.JavascriptType.CJS ] )
        if ( cjsMatch && cjsMatch.length > 0 ) {
            return JsToEs.JavascriptType.CJS
        }

        const classicObjectMatch = file.match( regex[ JsToEs.JavascriptType.Classic ] )
        if ( classicObjectMatch && classicObjectMatch.length > 0 ) {
            return JsToEs.JavascriptType.Classic
        }

        const prototypedObjectMatch = file.match( regex[ JsToEs.JavascriptType.Prototype ] )
        if ( prototypedObjectMatch && prototypedObjectMatch.length > 0 ) {
            return JsToEs.JavascriptType.Prototype
        }

        const libMatch = file.match( regex[ JsToEs.JavascriptType.Library ] )
        if ( libMatch && libMatch.length > 0 ) {
            return JsToEs.JavascriptType.Library
        }

        return JsToEs.JavascriptType.Unknown

    }

    static _convertFile ( banner, fileDatas, exportMap ) {

        const outputPath = fileDatas.output
        const outputDir  = dirname( outputPath )

        const formatedImports = JsToEs._formatImportStatements( outputPath, exportMap, fileDatas.imports )
        const formatedFile    = JsToEs._formatReplacementStatements( fileDatas.file, fileDatas.replacements )
        const formatedExports = JsToEs._formatExportStatements( outputPath, fileDatas.exports )
        const outputFile      = banner + formatedImports + formatedFile + formatedExports

        createFoldersTree( outputDir )
        writeFileSync( outputPath, outputFile )

    }

    static _copyFile ( banner, fileDatas ) {

        const outputPath = fileDatas.output
        const outputDir  = dirname( outputPath )
        const file       = banner + fileDatas.file

        createFoldersTree( outputDir )
        writeFileSync( outputPath, file )

    }

    static _getAllImportsStatementIn ( global, file, exports ) {

        let statements = []

        const matchs = file.match( /import\s+(?:(?:({[\w\s,]+})|([\w,*-]+))\s+)+from/g ) || []
        matchs.filter( makeUnique )
              .forEach( ( value ) => {

                  const results = value.replace( 'import', '' )
                                       .replace( 'from', '' )
                                       .replace( /[{}]/g, '' )
                                       .replace( /\s+/g, '' )
                                       .split( ',' )

                  // Check if the extends statement is not about the exported object !
                  let result = undefined
                  for ( let i = results.length - 1 ; i >= 0 ; --i ) {
                      result = results[ i ]

                      // Check if import matching does no concerne inner class
                      if ( exports.includes( result ) ) {
                          return
                      }

                      if ( !result ) {
                          results.splice( i, 1 )
                      }

                  }

                  if ( results.length > 0 ) {
                      Array.prototype.push.apply( statements, results )
                  }

              } )

        return statements

    }

    static _getAllExtendsStatementIn ( global, file, exports ) {

        let statements = []

        // By Object.assign
        const fileRegex   = new RegExp( `Object\\.assign\\(\\s*((${global}.)?(\\w+)\\.prototype[,]*\\s*){2,}`, 'g' )
        const globalRegex = new RegExp( `${global}\\.`, 'g' )

        const matchs = file.match( fileRegex ) || []
        matchs.filter( makeUnique )
              .forEach( ( value ) => {

                  const results = value.replace( /Object\.assign\(\s+/g, '' )
                                       .replace( globalRegex, '' )
                                       .replace( /\.prototype/g, '' )
                                       .replace( /\s+/g, '' )
                                       .split( ',' )

                  // Check if the extends statement is not about the exported object !
                  let result = undefined
                  for ( let i = results.length - 1 ; i >= 0 ; --i ) {
                      result = results[ i ]

                      // Check if import matching does no concerne inner class
                      if ( !result || exports.includes( result ) ) {
                          results.splice( i, 1 )
                      }

                  }

                  if ( results.length > 0 ) {
                      Array.prototype.push.apply( statements, results )
                  }

              } )

        return statements

    }

    static _getAllInheritStatementsIn ( global, file, exports ) {

        let statements = []

        const fileRegex   = new RegExp( `Object\\.create\\(\\s+((${global}.)?(\\w+)\\.prototype[,]?\\s*)+\\)`, 'g' )
        const globalRegex = new RegExp( `Object\\.create\\(\\s+(${global}.)?`, 'g' )

        const matchs = file.match( fileRegex ) || []
        matchs.filter( makeUnique )
              .forEach( ( value ) => {

                  const results = value.replace( globalRegex, '' )
                                       .replace( /\.prototype/g, '' )
                                       .replace( /\)/g, '' )
                                       .replace( /\s+/g, '' )
                                       .split( ',' )

                  // Check if the inherit statement is not about the exported object !
                  let result = undefined
                  for ( let i = 0, resultLength = results.length ; i < resultLength ; i++ ) {
                      result = results[ i ]

                      if ( !result || exports.includes( result ) ) {
                          results.splice( i, 1 )
                      }

                  }

                  if ( results.length > 0 ) {
                      Array.prototype.push.apply( statements, results )
                  }

              } )

        return statements

    }

    static _getAllNewStatementIn ( global, file, exports ) {

        let statements = []

        const fileRegex   = new RegExp( `new\\s${global}.(\\w+)\\s?`, 'g' )
        const globalRegex = new RegExp( `new\\s${global}\\.`, 'g' )

        const matchs = file.match( fileRegex ) || []
        matchs.filter( makeUnique )
              .forEach( ( value ) => {

                  const result = value.replace( globalRegex, '' )
                                      .replace( /\s+/g, '' )

                  // Check if the new statement is not about the exported object !
                  if ( exports.includes( result ) ) {
                      return
                  }

                  if ( result ) { statements.push( result ) }

              } )

        return statements

    }

    static _getAllInstanceOfStatementIn ( global, file, exports ) {

        let statements = []

        const fileRegex   = new RegExp( `instanceof\\s${global}.(\\w+)\\s?`, 'g' )
        const globalRegex = new RegExp( `instanceof\\s${global}\\.`, 'g' )

        const matchs = file.match( fileRegex ) || []
        matchs.filter( makeUnique )
              .forEach( ( value ) => {

                  const result = value.replace( globalRegex, '' )
                                      .replace( /\s+/g, '' )

                  // Check if the new statement is not about the exported object !
                  if ( exports.includes( result ) ) {
                      return
                  }

                  if ( result ) { statements.push( result ) }

              } )

        return statements

    }

    static _getImportsFor ( global, file, exports, edgeCase ) {

        if ( edgeCase.importsOverride ) {
            return edgeCase.importsOverride
        }

        let imports = []

        Array.prototype.push.apply( imports, JsToEs._getAllImportsStatementIn( global, file, exports ) )
        Array.prototype.push.apply( imports, JsToEs._getAllInheritStatementsIn( global, file, exports ) )
        Array.prototype.push.apply( imports, JsToEs._getAllExtendsStatementIn( global, file, exports ) )
        Array.prototype.push.apply( imports, JsToEs._getAllNewStatementIn( global, file, exports ) )
        Array.prototype.push.apply( imports, JsToEs._getAllInstanceOfStatementIn( global, file, exports ) )

        if ( edgeCase.imports ) {
            Array.prototype.push.apply( imports, edgeCase.imports )
        }

        // A class can be inherited and dynamicaly create by new in the same file so we need to check uniqueness
        return imports.filter( makeUnique )

    }

    static _formatImportStatements ( importerFilePath, exportMap, objectNames ) {

        let importStatements = []
        let importsMap       = {}

        objectNames.forEach( ( objectName ) => {

            if ( Array.isArray( objectName ) ) {

                importsMap[ objectName[ 2 ] ] = []
                importsMap[ objectName[ 2 ] ].push( objectName[ 0 ] )

            } else {

                const exporterFilePath = exportMap[ objectName ]
                if ( !exporterFilePath ) {
                    console.error( `WARNING: Missing export statement for: ${objectName} in ${importerFilePath} this is an edge case that will probably need to be managed manually !!!` )
                    return
                }

                // Compute relative path from importer to exporter
                const importerDirectoryName      = dirname( importerFilePath )
                const exporterDirectoryName      = dirname( exporterFilePath )
                const exporterBaseName           = basename( exporterFilePath )
                const relativePath               = relative( importerDirectoryName, exporterDirectoryName )
                const firstChar                  = relativePath[ 0 ]
                const notStartWithDot            = (firstChar !== '.')
                const relativeFilePath           = (notStartWithDot) ? './' + join( relativePath, exporterBaseName ) : join( relativePath, exporterBaseName )
                const relativeFilePathNormalized = relativeFilePath.replace( /\\/g, '/' )

                if ( !importsMap[ relativeFilePathNormalized ] ) {
                    importsMap[ relativeFilePathNormalized ] = []
                }
                importsMap[ relativeFilePathNormalized ].push( objectName )

            }

        } )

        for ( let importPath in importsMap ) {

            let imports = importsMap[ importPath ]

            let formatedImports = 'import {'

            if ( imports.length === 1 ) {

                formatedImports += ` ${imports[ 0 ]} `

            } else if ( imports.length > 1 ) {

                formatedImports += '\n'

                let importedObject = undefined
                for ( let i = 0, numberOfImports = imports.length ; i < numberOfImports ; i++ ) {
                    importedObject = imports[ i ]

                    if ( i === numberOfImports - 1 ) {
                        formatedImports += `\t${importedObject}\n`
                    } else {
                        formatedImports += `\t${importedObject},\n`
                    }

                }

            } else {

                console.error( `WARNING: ${basename( importPath )} does not contains imports, fallback to file name export...` )

            }
            formatedImports += `} from '${importPath}'`

            importStatements.push( formatedImports )

        }

        return importStatements.join( '\n' ).concat( '\n\n' ) // don't forget last feed line

    }

    static _getEs6ReplacementsFor ( global ) {

        let replacements = []

        replacements.push( [ /import\s+(?:(?:({[\w\s,]+})|([\w,*-]+))\s+)+from.+/g, '' ] )
        replacements.push( [ /export var/g, 'var' ] )
        replacements.push( [ /export function/g, 'function' ] )
        replacements.push( [ /export(?:[^s]|)(\s*{(?:[\w\s,])+}\s*)(?:(?:from)?\s?['"][./]+[\w.]+['"])?;?/g, '' ] )

        return replacements

    }

    static _getExportsReplacementsFor ( global, exports ) {

        let replacements = []

        for ( let i = 0, numberOfExports = exports.length ; i < numberOfExports ; i++ ) {

            const exportedObject = exports[ i ]

            const regex2       = new RegExp( `${global}.${exportedObject} =`, 'g' )
            const replacement2 = `var ${exportedObject} =`
            replacements.push( [ regex2, replacement2 ] )

            const regex1       = new RegExp( ' = var ', 'g' )
            const replacement1 = ' = '
            replacements.push( [ regex1, replacement1 ] )

        }

        return replacements

    }

    static _getIifeReplacementsFor ( global, file ) {

        const unspacedFile = file.replace( /\s+/g, '' )
        let replacements   = []

        // Check if this iife is a main englobing function or inner function
        const matchIife = unspacedFile.match( /^\(\s*function\s*\(\s*(\w+)?\s*\)\s*\{/g ) || []
        if ( matchIife.length > 0 ) {

            replacements.push( [ /\(\s*function\s*\(\s*(\w+)?\s*\)\s*\{/, '' ] )

            // Check for end type with params or not
            const matchParametrizedEndIife = unspacedFile.match( /}\s*\)\s*\(\s*[\w.=\s]*(\|\|\s*\{\})?\s*\);?$/ ) || []
            const matchEmptyEndIife        = unspacedFile.match( /}\s*\(\s*[\w]*\s*\)\s*\);?$/ ) || []
            if ( matchParametrizedEndIife.length > 0 ) {

                replacements.push( [ /}\s*\)\s*\(\s*[\w.=\s]*(\|\|\s*\{\})?\s*\);?/, '' ] )

            } else if ( matchEmptyEndIife.length > 0 ) {

                replacements.push( [ /}\s*\(\s*[\w]*\s*\)\s*\);?/, '' ] )

            } else {

                throw new Error( 'Unable to match end of IIFE.' )

            }

        }

        return replacements

    }

    static _getGlobalReplacementsFor ( global ) {

        const regex1 = new RegExp( `${global}\\.Math\\.`, 'g' )
        const regex2 = new RegExp( `${global}\.`, 'g' )

        return [
            [ regex1, '_Math.' ],
            [ regex2, '' ]
        ]

    }

    static _getAutoAssignementReplacementsFor ( global ) {

        return [ [ /var\s?(\w+)\s?=\s?\1;/g, '' ] ]

    }

    static _getReplacementsFor ( global, file, exports, edgeCase ) {

        if ( edgeCase.replacementsOverride ) {
            return edgeCase.replacementsOverride
        }

        let replacements = []

        Array.prototype.push.apply( replacements, JsToEs._getEs6ReplacementsFor( global ) )
        Array.prototype.push.apply( replacements, JsToEs._getExportsReplacementsFor( global, exports ) )
        Array.prototype.push.apply( replacements, JsToEs._getIifeReplacementsFor( global, file ) )
        Array.prototype.push.apply( replacements, JsToEs._getGlobalReplacementsFor( global ) )
        Array.prototype.push.apply( replacements, JsToEs._getAutoAssignementReplacementsFor( global ) )

        if ( edgeCase.replacements ) {
            Array.prototype.push.apply( replacements, edgeCase.replacements )
        }

        return replacements

    }

    static _formatReplacementStatements ( file, replacements ) {

        let _file = file
        for ( let replaceIndex = 0, numberOfReplacements = replacements.length ; replaceIndex < numberOfReplacements ; replaceIndex++ ) {

            const replacement = replacements[ replaceIndex ]
            _file             = _file.replace( replacement[ 0 ], replacement[ 1 ] )

        }
        return _file

    }

    static _getExportsStatementsInES6File ( global, file ) {

        let exportedElements = []

        // Todo: May be it should be splitted by export type... direct, named, default, as etc...
        const es6MatchedExports = file.match( /export(?:[^s]|)(?:(?:\s*{([\w\s,]+)}\s*)(?:(?:from)?\s?['"]([./]+[\w.]+['"]);?)?|(var\s+.+))/g )
        if ( es6MatchedExports ) {

            // Clean
            es6MatchedExports.forEach( ( value ) => {

                if ( value.contains( 'from' ) ) {

                    const splitOnFrom = value.split( 'from' )
                    const exports     = splitOnFrom[ 0 ]
                        .replace( /export/g, '' )
                        .replace( /[\s\n\r;{}]+/g, '' )
                    //                    .split( ',' )

                    const exportFile = splitOnFrom[ 1 ].replace( /[\s'";]+/g, '' )

                    // Todo: allow exports like 'foo, bar, baz' and parse it when create exports statements
                    Array.prototype.push.apply( exportedElements, [ [ exports, 'from', exportFile ] ] )
                    return

                }

                if ( value.contains( 'as' ) ) {

                    value = value.replace( /\w+\sas/g, '' )

                }

                if ( value.contains( 'var' ) ) {

                    value = value.replace( /export/g, '' )
                                 .replace( /var/g, '' )
                                 .replace( /\s*=\s*.+/g, '' )

                }

                if ( value.contains( 'function' ) ) {

                    value = value.replace( /function/g, '' )

                }

                const results = value.replace( /export/g, '' )
                                     .replace( /[\s\n\r;{}]+/g, '' )
                                     .split( ',' )

                Array.prototype.push.apply( exportedElements, results )

            } )

        }

        return exportedElements

    }

    static _getExportsStatementsInAMDFile ( global, file ) {

        console.error( `WARNING: File is unable to be process... It is an AMD module. Sorry for the disagreement.` )
        return []

    }

    static _getExportsStatementsInCJSFile ( global, file ) {

        let exportedElements = []

        const fileRegex = new RegExp( /module\.exports\s*=\s*\{?[^}]*}?/g )

        const commonjsExports = file.match( fileRegex )
        if ( commonjsExports ) {

            // Clean
            commonjsExports.forEach( ( value ) => {

                const results = value.replace( /module\.exports/g, '' )
                                     .replace( /[\s\n\r;{}=]+/g, '' )
                                     .split( ',' )

                Array.prototype.push.apply( exportedElements, results )

            } )

        }

        return exportedElements

    }

    static _getExportsStatementsInClassicFile ( global, file ) {

        let exportedElements = []

        const fileRegex   = new RegExp( `(${global}.(\\w+)\\s*=\\s*)+\\s*function`, 'g' )
        const globalRegex = new RegExp( `${global}\\.|\\s*=\\s*function`, 'g' )

        const potentialClassicObjectExports = file.match( fileRegex )
        if ( potentialClassicObjectExports ) {

            // Clean
            potentialClassicObjectExports.forEach( ( value ) => {

                const results = value.replace( globalRegex, '' )
                                     .replace( /\s*/g, '' )
                                     .split( '=' )

                Array.prototype.push.apply( exportedElements, results )

            } )

        }

        return exportedElements

    }

    static _getExportsStatementsInPrototypedFile ( global, file ) {

        let exportedElements = []

        const fileRegex   = new RegExp( `prototype\\.constructor\\s?=\\s?(${global}\\.)?(\\w)+`, 'g' )
        const globalRegex = new RegExp( `${global}\\.`, 'g' )

        const potentialPrototypedObjectExports = file.match( fileRegex )
        if ( potentialPrototypedObjectExports ) {

            // Clean
            potentialPrototypedObjectExports.forEach( ( value ) => {

                const result = value.replace( /prototype\.constructor\s?=\s?/g, '' )
                                    .replace( globalRegex, '' )

                exportedElements.push( result )

            } )

        }

        return exportedElements

    }

    static _getExportsStatementInLibraryFile ( global, file ) {

        let exportedElements = []

        const fileRegex   = new RegExp( `${global}.(\\w+) = \\{`, 'g' )
        const globalRegex = new RegExp( `${global}\\.| = \\{`, 'g' )

        const potentialLibExports = file.match( fileRegex )
        if ( potentialLibExports ) {

            // Clean
            potentialLibExports.forEach( ( value ) => {

                const result = value.replace( globalRegex, '' )

                exportedElements.push( result )

            } )

        }

        return exportedElements

    }

    static _getExportsFor ( global, fileType, file, baseName, edgeCase ) {

        if ( edgeCase.exportsOverride ) {
            return edgeCase.exportsOverride
        }

        let exports = undefined

        switch ( fileType ) {

            case JsToEs.JavascriptType.AMD:
                exports = JsToEs._getExportsStatementsInAMDFile( global, file )
                break

            case JsToEs.JavascriptType.CJS:
                exports = JsToEs._getExportsStatementsInCJSFile( global, file )
                break

            case JsToEs.JavascriptType.Classic:
                exports = JsToEs._getExportsStatementsInClassicFile( global, file )
                break

            case JsToEs.JavascriptType.Es6:
                exports = JsToEs._getExportsStatementsInES6File( global, file )
                break

            case JsToEs.JavascriptType.Library:
                exports = JsToEs._getExportsStatementInLibraryFile( global, file )
                break

            case JsToEs.JavascriptType.Prototype:
                exports = JsToEs._getExportsStatementsInPrototypedFile( global, file )
                break

            case JsToEs.JavascriptType.UMD:
            case JsToEs.JavascriptType.Unknown:
                exports = [ baseName ]
                break

            default:
                throw new RangeError( `Invalid switch parameter: ${fileType}` )
                break

        }

        if ( exports.length === 0 ) {
            console.error( `WARNING: ${baseName} does not contains explicit or implicit export, fallback to file name as export...` )
            exports = [ baseName ]
        }

        if ( edgeCase.exports ) {
            Array.prototype.push.apply( exports, edgeCase.exports )
        }

        return exports.filter( makeUnique )

    }

    static _formatExportStatements ( filePath, exports ) {

        // Formating
        let formatedExports = ''

        // First check for specified exports
        let specificExports = []
        let regularExports  = []

        exports.forEach( exports => {

            ( Array.isArray( exports ) ) ? specificExports.push( exports ) : regularExports.push( exports )

        } )

        if ( specificExports.length === 0 && regularExports.length === 0 ) {

            console.error( `WARNING: ${basename( filePath )} does not contains explicit or implicit export, fallback to file name export... It must be an Es6 file with it own exports !` )
            return ''

        }

        // Process specific exports
        for ( let i = 0, numbSpecExp = specificExports.length ; i < numbSpecExp ; i++ ) {

            const exports          = specificExports[ i ]
            const exportedClass    = exports[ 0 ]
            const exportAction     = exports[ 1 ]
            const exportComplement = exports[ 2 ]

            if ( exportAction === 'from' ) {

                formatedExports += `export { ${exports[ 0 ]} } from "${exportComplement}"\n`

            } else if ( exportAction === 'as' ) {

                formatedExports += `export { ${exports[ 0 ]} as ${exportComplement} }\n`

            } else {

                // Todo: export { Foo as Bar } from 'Baz'
                throw new Error( 'Invalid specified export action !' )

            }

        }

        // Process regular exports
        const numberOfExports = regularExports.length
        if ( numberOfExports === 1 ) {

            formatedExports += `\nexport { ${exports[ 0 ]} }\n`

        } else if ( numberOfExports > 1 ) {

            formatedExports += '\nexport {\n'
            for ( let i = 0 ; i < numberOfExports ; i++ ) {

                formatedExports += ( i === numberOfExports - 1 ) ? '\t' + regularExports[ i ] + '\n' : '\t' + regularExports[ i ] + ',\n'

            }
            formatedExports += '}\n'

        }

        return formatedExports

    }

    static _getOutputFor ( filePath, outputBasePath, edgeCase ) {

        if ( edgeCase.outputOverride ) {
            return join( outputBasePath, edgeCase.outputOverride )
        }

        const specificPath = JsToEs._getSpecificPath( outputBasePath, filePath )
        const outputPath   = join( outputBasePath, specificPath )
        return outputPath

    }

    static _getSpecificPath ( base, target ) {

        const baseSplits   = base.split( sep )
        const targetSplits = target.split( sep )

        let index          = 0
        while(baseSplits[index] === targetSplits[index]) {
            index++
        }
        index++

        const specificPath = targetSplits.slice(index).join(sep)

        return specificPath

    }

    static _createFilesMap ( global, regex, filesPaths, edgeCases, outputBasePath ) {

        const filesMap = {}

        filesPaths.forEach( ( filePath ) => {

            const fileExtension = extname( filePath )
            const baseName      = basename( filePath, fileExtension )

            if ( filesMap[ baseName ] ) {
                console.error( `WARNING: The file ${baseName} already exist in the file map ! Is there a duplicated file ???` )
                return
            }

            const file         = getUncommentedFileForPath( filePath )
            const isJavascript = ( fileExtension === '.js' )
            const edgeCase     = edgeCases[ baseName ] || {}

            if ( isJavascript ) {

                const fileType     = JsToEs._getFileType( file, regex )
                const exports      = JsToEs._getExportsFor( global, fileType, file, baseName, edgeCase )
                const imports      = JsToEs._getImportsFor( global, file, exports, edgeCase )
                const replacements = JsToEs._getReplacementsFor( global, file, exports, edgeCase )
                const output       = JsToEs._getOutputFor( filePath, outputBasePath, edgeCase )

                filesMap[ baseName ] = {
                    isJavascript,
                    fileType,
                    file,
                    imports,
                    replacements,
                    exports,
                    output
                }

            } else {

                const output = JsToEs._getOutputFor( filePath, outputBasePath, edgeCase )

                filesMap[ baseName ] = {
                    isJavascript,
                    file,
                    output
                }

            }

        } )

        return filesMap

    }

    static _createExportMap ( filesPaths, regex, edgeCases, outputBasePath ) {

        const exportsMap = {}

        filesPaths.forEach( ( filePath ) => {

            const fileExtension = extname( filePath )
            const baseName      = basename( filePath, fileExtension )
            const edgeCase      = edgeCases[ baseName ] || {}
            const file          = getUncommentedFileForPath( filePath )
            const fileType      = JsToEs._getFileType( file, regex )
            const exports       = JsToEs._getExportsFor( global, fileType, file, baseName, edgeCase )
            const outputPath    = JsToEs._getOutputFor( filePath, outputBasePath, edgeCase )

            exports.forEach( ( exportedElement ) => {

                // Check case where export is an array with 'from' or 'as'
                if ( Array.isArray( exportedElement ) ) {
                    exportedElement = exportedElement[ 0 ]
                }

                const exportPath = exportsMap[ exportedElement ]
                if ( exportPath ) {

                    const exportName = basename( exportPath )
                    const fileName   = basename( filePath )

                    console.error( `WARNING: Element "${exportedElement}" in ${fileName} is already exported by source ${exportName}! Unable to determine which source file is the right exporter !!!` )
                    return

                }

                exportsMap[ exportedElement ] = outputPath

            } )

        } )

        return exportsMap

    }

    static _processFiles ( fileMap, exportMap, banner ) {

        for ( let fileName in fileMap ) {

            if ( !fileMap.hasOwnProperty( fileName ) ) { continue }

            const fileData = fileMap[ fileName ]

            if ( fileData.isJavascript ) {

                JsToEs._convertFile( banner, fileData, exportMap )

            } else {

                JsToEs._copyFile( banner, fileData )

            }

        }

    }

    // Chainable setters
    setInputs ( value ) {
        this.inputs = value
        return this
    }

    setExcludes ( value ) {
        this.excludes = value
        return this
    }

    setOutput ( value ) {
        this.output = value
        return this
    }

    setEdgeCases ( value ) {
        this.edgeCases = value
        return this
    }

    setBanner ( value ) {
        this.banner = value
        return this
    }

    setGlobal ( value ) {
        this.global = value
        return this
    }

    convert ( callback ) {

        const inputs    = this._inputs
        const excludes  = this._excludes
        const output    = this._output
        const edgeCases = this._edgeCases
        const banner    = this._banner
        const global    = this._global
        const regex     = this._regex

        if ( callback ) {

            try {

                const allFilesPaths       = JsToEs._getFilesPathsUnder( inputs )
                const availableFilesPaths = JsToEs._excludesFilesPaths( allFilesPaths, excludes )
                const jsFiles             = JsToEs._filterJavascriptFiles( availableFilesPaths )

                this._fileMap   = JsToEs._createFilesMap( global, regex, availableFilesPaths, edgeCases, output )
                this._exportMap = JsToEs._createExportMap( jsFiles, regex, edgeCases, output )

                JsToEs._processFiles( this._fileMap, this._exportMap, banner )

                callback()

            } catch ( error ) {

                callback( error )

            }

        } else {

            return new Promise( ( resolve, rejects ) => {

                try {

                    const allFilesPaths       = JsToEs._getFilesPathsUnder( inputs )
                    const availableFilesPaths = JsToEs._excludesFilesPaths( allFilesPaths, excludes )
                    const jsFiles             = JsToEs._filterJavascriptFiles( availableFilesPaths )

                    this._fileMap   = JsToEs._createFilesMap( global, regex, availableFilesPaths, edgeCases, output )
                    this._exportMap = JsToEs._createExportMap( jsFiles, regex, edgeCases, output )

                    JsToEs._processFiles( this._fileMap, this._exportMap, banner )

                    resolve()

                } catch ( error ) {

                    rejects( error )

                }

            } )

        }

    }

}

export { JsToEs }
const { fs, util } = require('vortex-api');
const path = require('path');

const GAME_ID = 'citiesskylines';
const STEAMAPP_ID = '255710';
// const EPICAPP_ID = ''; // Unknown ID research required. https://modding.wiki/en/vortex/developer/game-detection
// const ORIGINAPP_ID = ''; // Unknown ID research required. https://modding.wiki/en/vortex/developer/game-detection

const MOD_BASE_PATH = path.join(util.getVortexPath('localAppData'), 'Colossal Order', 'Cities_Skylines');
const MOD_PATH = path.join(MOD_BASE_PATH, 'Addons', 'Mods'); // Mods are DLLs in subfolders
const ASSET_PATH = path.join(MOD_BASE_PATH, 'Addons', 'Assets'); // Assets are CRPs in (optionally) subfolders
const MAPS_PATH = path.join(MOD_BASE_PATH, 'Maps'); // Maps are CRP files
const SAVES_PATH = path.join(MOD_BASE_PATH, 'Saves'); // Saves are CRP files

const FILE_EXT = '.crp'; 
const MOD_EXT = '.dll';
// const HARMONY = 'citiesharmony.harmony.dll'; // Must go in the "Mods" folder without a subfolder.

function findGame() {
    return util.GameStoreHelper.findByAppId([STEAMAPP_ID])
    .then(game => game.gamePath);
}

function prepareForModding() {
    // Make sure all the folders we might need exist. 
    return Promise.all([
        fs.ensureDirAsync(MOD_PATH),
        fs.ensureDirAsync(ASSET_PATH),
        fs.ensureDirAsync(MAPS_PATH),
        fs.ensureDirAsync(SAVES_PATH),
    ]);
}

function testMod(files, gameId) {
    // Is this a Cities Skylines mod and does it contain a CRP or DLL file.
    const supported = (gameId === GAME_ID && 
        !!files.find(file => path.extname(file).toLowerCase() === MOD_EXT.toLowerCase() || path.extname(file).toLowerCase() === FILE_EXT.toLowerCase()));
    
    return Promise.resolve({supported, requiredFiles: []});
}

async function installMod(api, files) {
    let instructions = [];

    const filteredFiles = files.filter(file => path.extname(file));

    // Install as a "mod" if a DLL was located
    if (!!files.find(file => path.extname(file).toLowerCase() === MOD_EXT.toLowerCase())) instructions = await installAsMod(filteredFiles);
    // If there are no DLLs and a CRP is located, run the CRP installer. 
    else if (!!files.find(file => path.extname(file).toLowerCase() === FILE_EXT.toLowerCase())) instructions = await installCRP(api, filteredFiles);
    
    return Promise.resolve({instructions});
    
}

async function installAsMod(files) {
    // Simply path all mods to the Addons/Mods folders
    const modFiles = files.map(file => ({
        type: 'copy',
        source: file,
        destination: path.join('Addons', 'Mods', file)
    }));

    return modFiles;
}

async function installCRP(api, files) {
    let installDir; // Can be 'Maps', 'Saves' or 'Addons\\Assets';

    // Are we dealing with loose CRPs?
    const loose = ((files.filter(file => file.indexOf(path.sep) === 0)).length === files.length);

    // Do any paths start with the Assets, Maps or Saves folder?
    if (!loose) {
        const assetsFolder = !!(files.find(file => file.indexOf('Assets') === 0));
        const mapsFolder = !!(files.find(file => file.indexOf('Maps') === 0));
        const savesFolder = !!(files.find(file => file.indexOf('Saves') === 0));
        if (assetsFolder) installDir = 'Addons';
        else if (mapsFolder) installDir = 'Maps';
        else if (savesFolder) installDir = 'Saves';
    }

    // As the user if we can't work it out.
    if (!installDir) {
        installDir = await askUserModType(api);
    }

    if (!installDir) return Promise.reject(new Error('Unable to determine mod type'));

    //Send instructions back to the installer function.
    return files.map(file => ({
        type: 'copy',
        source: file,
        destination: path.join(installDir, file)
    }));
}

async function askUserModType(api) {
    const response = await api.showDialog('question', 'Unidentified Mod Type', 
    {
        text: 'Vortex has been unable to automatically determine the type of mod you are installing based on the file structure.'+
        'This is because Cities Skylines uses CRP format files for Assets, Saves and Maps. Please select which type of mod this is from the options below to complete the installation.',
    },
    [
        { label: 'Cancel' },
        { label: 'Install as Asset' },
        { label: 'Install as Map' },
        { label: 'Install as Save'}
    ]
    ); 

    if (response.action === 'Cancel') return Promise.reject(new util.ProcessCanceled('Mod install cancelled by the user.'));
    
    switch (response.action) {
        case ('Install as Asset'): return path.join('Addons', 'Assets');
        case ('Install as Map'): return 'Maps';
        case ('Install as Save'): return 'Saves';
        default: return undefined;
    }

}

function main(context) {

    context.registerGame({
        id: GAME_ID,
        name: 'Cities: Skylines',
        setup: prepareForModding,
        mergeMods: true,
        queryPath: findGame,
        queryModPath: () => MOD_BASE_PATH,
        logo: 'gameart.jpg',
        executable: () => 'Cities.exe',
        requiredFiles: [
            "Cities.exe"
        ],
        details: {
            steamAppId: STEAMAPP_ID
        }
    });

    context.registerInstaller('cities-skylines-installer', 25, testMod, (files) => installMod(context.api, files));

    return true;

}

module.exports = {
    default: main
};
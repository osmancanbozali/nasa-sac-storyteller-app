import React from 'react';

function Header({ onExport, onImport, isResponseLoading }) {
  return (
    <header className="sticky top-0 bg-slate-900 text-white p-4 shadow-md z-10 flex justify-between items-center">
      <h1 className="text-xl font-bold">OrbiTales</h1>
      <div className="flex">
        <button
          onClick={onExport}
          className="bg-slate-500 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded mr-2 w-24 h-10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isResponseLoading}
        >
          Export
        </button>
        <label className={`
          ${isResponseLoading ? 'bg-slate-700' : 'bg-slate-500 hover:bg-slate-700'}
          text-white font-bold py-2 px-4 rounded cursor-pointer w-24 h-10 flex items-center justify-center
          ${isResponseLoading ? 'opacity-50 cursor-not-allowed' : ''}
        `}>
          Import
          <input
            type="file"
            accept=".json"
            onChange={onImport}
            className="hidden"
            disabled={isResponseLoading}
          />
        </label>
      </div>
    </header>
  );
}

export default Header;
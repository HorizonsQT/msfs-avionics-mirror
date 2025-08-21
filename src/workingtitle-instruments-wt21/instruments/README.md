# Working Title WT21 Instruments

This is the source code for the Working Title WT21 avionics system instruments code for MSFS. To build it first build the WT21 shared library (see the README in the `shared` directory for more details). Then run `npm i && npm run build` in the instruments package.

This will compile the code and bundle up all the resources, putting the final output in the `dist` directory. However, it does not create manifest or layout files -- these will need to be prepared by the user based on instructions and various tooling available online.

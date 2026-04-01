Task({
	~root =	PathName(File.getcwd);
	~sourceDir = ~root +/+ "synthdefs";
	~targetDir = ~root +/+ "static" +/+ "compiled_synthdefs";
	~metadataFilePath = ~targetDir +/+ "metadata.json";
	~metadata = Dictionary.new;

    ~numSynthDefs = 0;

	~sourceDir.files.do({
		arg file;

		~synthdefs = nil;

		// Execute .scd file
		if (file.extension == "scd") {
			try {
                ("Processing" + file.fileName).postln;
				// file should assign an array of SynthDef objects to ~synthdefs
				file.fullPath.load;
			} {
                ("Error loading " + file.fileName).error;
                1.exit;
            };
		};

		if (~synthdefs.isNil || ~synthdefs.size == 0) {
			(
				file.fileName +
				" failed to export any SynthDefs for compiling. Forgot to define the ~synthdefs array?"
			).warn;
		};

		// Compile exported SynthDefs
		~synthdefs.do({
			arg def;
			try {
				def.writeDefFile(~targetDir.fullPath);
				~metadata.put(def.name, def.metadata ?? Dictionary.new);
				~metadata[def.name].put(\source, file.fileName);
                ~numSynthDefs = ~numSynthDefs + 1;
			} {
                ("Error compiling SynthDef " + def.name).error;
                2.exit;
            };
		});
	});


	~metadataFile = File.open(~metadataFilePath.fullPath, "w");
	~metadataFile.write(~metadata.asJSON);
	~metadataFile.close;
    
    // Wait for a second before exiting to let any deferred .writeDefFile calls wrap up
    1.wait;
    
    ("\nCompiled" + ~numSynthDefs + "SynthDefs").postln;
    
    0.exit;
}).play;
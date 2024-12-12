module.exports = function(grunt) {
	require("load-grunt-tasks")(grunt);
	const {nodeResolve} = require('@rollup/plugin-node-resolve');

	// grun tasks
	grunt.initConfig({
		pkg: grunt.file.readJSON("package.json"),
		config: {
			js: "dist/server-log-insights-tracking.js"
		},
		rollup: {
			options: {
				sourcemap: true,
				plugins: [nodeResolve()]
			},
			es6: {
				options: {
					format: "es"
				},
				src: "src/build.js",
				dest: "<%= config.js %>"
			}
		},
		terser: {
			options: {
				toplevel: true
			},
			es6: {
				ecma: 2015,
				mangle: {
					module: true
				},
				files: {
					"<%= config.js %>": "<%= config.js %>"
				}
			}
		},
		watch: {
			options: {
				interrupt: true,
				spawn: false,
				atBegin: true
			},
			js: {
				files: ["src/**/*.js"],
				tasks: ["rollup:es6"]
			},
			gruntfile: {
				files: ["gruntfile.js", "package.json"],
				tasks: ["rollup:es6"]
			}
		}
	});

	grunt.registerTask("default", ["rollup", "terser"]);
	grunt.registerTask("js", ["rollup"]);
};

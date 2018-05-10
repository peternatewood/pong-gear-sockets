module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    uglify: {
      options: { preserveComments: false },
      build: {
        src: [ "src/client.js" ],
        dest: "public/main.js"
      }
    }
  });

  grunt.loadNpmTasks("grunt-contrib-uglify");
  grunt.registerTask("default", [ "uglify" ]);
}

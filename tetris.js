document.addEventListener("DOMContentLoaded", loadTetris, false);

function loadTetris(){
    axios.get("tetris-data.json")
    .then(function(res){
        window.tetris_pieces = transformTetrisData(res.data);
        var loading = document.getElementById("loading");
        loading.parentNode.removeChild(loading);
        tetris();
    });
}

function transformTetrisData(data){
    var transform = Object.keys(data.shapes).map(function(key){
        var shape = data.shapes[key];
        shape.color = parseInt(data.colors[shape.color]);
        shape.key = key;
        return shape;
    }).reduce(function(prev, current, index){
       prev[current.key] = current;
       return prev; 
    }, {});
    return transform;
}

function tetris(){
	
	var self = this;
	
	// Rows of the grid
    var ROWS = 20;

    // Columns of the grid
    var COLS = 10;

    // Size of a tile of the grid (both width and height)
    var tile_size = 20;

    // grid object contains
    //  w:      width of the grid
    //  h:      height of the grid
    //  cells:  the stacked pieces, 2d array of the colors of the blocks
    // it also contains a Phaser group to hold the sprite for the blocks (sprite_group)
    // but it is added after Phaser has started
    grid = {
        w: tile_size * COLS,
        h: tile_size * ROWS,
        cells: []
    };
    // Width and height of the canvas,
    // The canvas displays the grid, the next piece and info of the current level
    var canvas_w = grid.w * 2;
    var canvas_h = grid.h;
    
    // Setting up the framework
    var game = new Phaser.Game(canvas_w, canvas_h, Phaser.AUTO, 'tetris_wrapper', {
        preload: preload, create: create
    });

    var pieces = window.tetris_pieces; // get pieces from object loaded in another script

    // next piece and current piece displayed on the canvas
    // a piece is an object with an x, an y, a rotations array, a color and a shape
    var current_piece;
    var next_piece;

    // every times a piece lands in the grid and it's not gameover, you get some points
    // more landed blocks -> more points
    var points = 0;
    var points_txt;
    var lines = 0;       // how many lines have we cleared in this level
    var max_lines = 10;  // how many lines to clear for completing the level
    var lines_txt;
    var level = 1;
    var level_txt;
    var step = Phaser.Timer.HALF; // how many time (in ms, starts with 500ms) passes before a piece falls by 1 tile unit
    var step_txt;
    var is_gameover = false;
    var fixed_delay = 100; // fixed delay in milliseconds added to step so the step does not became zero
	var timer;
    var rotation = 0;   // cuurent rotation of the current piece being controlled
    
    function ud(x){  return tile_size*x; }  // convert tile units to pixel units  (unit diference)
    function iud(x){ return Math.floor(x/tile_size); }  // convert pixel units to tile units  (inverse unit diference)
    
	function preload(){
		// (key, src, w, h)
        game.load.image('tile', 'tetris-tile.png');
	}
	function create(){
        // check that no other Phaser game is running
        // and if it is, destroy it and remove it from array
        if(Phaser.GAMES.length > 1 && Phaser.GAMES[0]){
            Phaser.GAMES[0].destroy();
            Phaser.GAMES.shift();
        }
		init_grid();
        grid.sprite_group = game.add.group();
        current_piece = random_piece();
        next_piece = random_piece();
        next_piece.x = 12;
        next_piece.y = 4;
        draw_UI();
        draw_grid();
        draw_piece(current_piece);
        draw_piece(next_piece);
        timer = game.time.events.loop(step + fixed_delay, tick, this); // run tick() every 0.6 seconds (first level).
        self.timer = timer;
        game.input.keyboard.addCallbacks(null, null, onKeyUp); // get input for moving and rotating current piece
	}
    
    function tick(){
        self.move(0, 1);
    }
    
    function gameover(alert_msg){
        is_gameover = true;
        timer.timer.destroy();
        var default_msg = 'GAME OVER. \n'+
                          '---------------------\n'+
                          'You got '+points+' Points. \n'+
                          'Press Ctrl+R to reload';
        document.getElementById("gameover").hidden = false;                          
        window.alert(alert_msg || default_msg);
    }
    
    // easter egg
    window.curro = function(){
        alert("Software libre o barbarie");
    }
    
    // load level from json saved in browser local storage
    window.load_level = function load_level(){
        var lvl = localStorage.getItem("level");
        if(lvl === null){
            console.log("No level in local storage");
        }else{
            var parsed_lvl = JSON.parse(lvl);
            grid.cells = parsed_lvl.cells;
            lines = 0;
            max_lines = parsed_lvl.lines;
            lines_txt.text = 'Lines: '+lines+'/'+max_lines;
            level = 10;
            level_txt.text = "Level: "+parsed_lvl.name;
            step = parsed_lvl.step;
            speed = 0.5 - step;
            step_txt.text = "Speed: "+speed;
            timer.timer.pause();
            timer.delay = step + fixed_delay;
            timer.timer.resume();
            current_piece = random_piece();
            next_piece = random_piece();
            next_piece.x = 12;
            next_piece.y = 4;
            
        }
    }
    
    window.tetris_rotate = self.rotate = function rotate(){
        if(is_gameover)
            return; // do not move if it is gameover
        var old_shape = current_piece.shape;
        var new_rot = (rotation + 1) % current_piece.rotations.length;
        var new_shape_txt = current_piece.rotations[new_rot];
        
        var new_shape = parse_shape(new_shape_txt);
        current_piece.shape = new_shape;
        var pos = {x: current_piece.x, y: current_piece.y};
        if(tile_collision(pos) || side_collision(pos) || down_collision(pos)){
            current_piece.shape = old_shape;
        }else{
            rotation = new_rot;
        }
        redraw_all();
    };
    
	window.tetris_move = self.move = function move(x, y){
        if(is_gameover)
            return; // do not move if it is gameover
        var new_pos = {x: current_piece.x + x, y: current_piece.y + y};
        var tile_col = tile_collision(new_pos); // do not call tile_collision(new_pos) twice
        var down_col = down_collision(new_pos); // do not call down_collsiion(new_pos) twice
        if(y){
            if(down_col || tile_col){
                points += Math.max(down_col, tile_col) * 10;
                points_txt.text = 'Points: '+points;
                get_next_piece();
            }else{
                current_piece.y = new_pos.y;
            }
        }
        else if(x){
            if(!side_collision(new_pos) && !tile_col){
                current_piece.x = new_pos.x;
            }
        }
        redraw_all();
        
        return tile_col || down_col;
	};
    
    window.tetris_drop = self.drop = function drop(){
        while(!move(0, 1));
    }
    
    function onKeyUp(e){
        var kb = Phaser.Keyboard;
        switch (e.keyCode) {
            case kb.LEFT:
                self.move(-1, 0);
                break;
            case kb.RIGHT:
                self.move(1, 0);
                break;
            case kb.DOWN:
                self.move(0, 1);
                break;
            case kb.SPACEBAR:
                self.drop();
                break;
            case kb.UP:
                self.rotate();
                break;
            default:
                break;
        }
        e.preventDefault();
    }
    
    // disable keydoen event on arrow keys and spacebar
    window.addEventListener("keydown", function(e) {
        // space and arrow keys
        if([32, 37, 38, 39, 40].indexOf(e.keyCode) > -1) {
            e.preventDefault();
        }
    }, false);
    
    function init_grid(){
        for (var row = 0; row < ROWS; row++) {
            grid.cells[row] = [];
            for (var col = 0; col < COLS; col++) {
                grid.cells[row][col] = 0;
            }
        }
    }
    
    function random_piece_name(){
        var names = ["L", "J", "T", "I", "O", "S", "Z"];
        return names[Math.floor(Math.random() * names.length)];
    }
    
    function random_piece(){
        var name = random_piece_name();
        return get_piece(name);
    }
    
    function parse_shape(shape_txt){
	var shape = shape_txt.split(' ').map(function(row, y){
	  return row.split('').map(function(elem){
	    return parseInt(elem);
	  })
	});
        return shape;
    }
    
    function get_piece(name){
        var piece_data = pieces[name];
        // definition of the piece object
        var piece = { 
            x: Math.floor(Math.random() * (COLS-4)),
            y: -3,
            color: piece_data.color,
            shape: [],
            rotations: piece_data.rotations
        };
        // parsing shape from string as '2d int array' 
        piece.shape = parse_shape(piece_data.shape);
        return piece;
    }

    function forEachBlock(piece, callback){
      piece.shape.forEach(function(row, rowIndex){
        row.forEach(function(block, colIndex){
	  if(block !== 0){
	    callback(piece, rowIndex, colIndex, row, block);
	  }
	});
      });
    }

    function down_collision(new_pos){
        var collision = 0;
	/*
	for(var row = 0; row < current_piece.shape.length; row++){
            for(var col = 0; col < current_piece.shape[row].length; col++){
                if(current_piece.shape[row][col] !== 0){
                    var yindex = new_pos.y + row;
                    var xindex = new_pos.x + col;
                    if(yindex >= grid.cells.length){
                        collision++; // collsion with ground
                    }
                }
            }
        }
	*/
	forEachBlock(current_piece, function(piece, 
		                             rowIndex, colIndex,
	                                     row, block){
	  if(block !== 0){
            var yindex = new_pos.y + rowIndex;
            var xindex = new_pos.x + colIndex;
            if(yindex >= grid.cells.length){
              collision++; // collsion with ground
            }
          }
	});
        return collision;
    }
    
    function tile_collision(new_pos){
        var collision = 0;
        for(var row = 0; row < current_piece.shape.length; row++){
            for(var col = 0; col < current_piece.shape[row].length; col++){
                if(current_piece.shape[row][col] !== 0){
                    var yindex = new_pos.y + row;
                    var xindex = new_pos.x + col;
                    if(grid.cells[yindex] && 
                        typeof(grid.cells[yindex][xindex]) === 'number' && 
                        grid.cells[yindex][xindex] !== 0)
                    {
                        collision++; // collision with other tiles
                    }
                }
            }
        }
        return collision;
    }
    
    function side_collision(new_pos){
        var collision = false;
        for(var row = 0; row < current_piece.shape.length; row++){
            for(var col = 0; col < current_piece.shape[row].length; col++){
                if(current_piece.shape[row][col] !== 0){
                    var yindex = new_pos.y + row;
                    var xindex = new_pos.x + col;
                    if(xindex < 0 || xindex >= grid.cells[0].length){
                        collision = true; // collision with sides
                    }
                }
            }
        }
        return collision;
    }
    
    function check_lines(){
        var new_lines = 0;
        var level_clear = false;
        for (var row = 0; row < grid.cells.length; row++) {
            var isFilled = true; // assume the line is full
            for (var col = 0; col < grid.cells[row].length; col++) {
                if(grid.cells[row][col] === 0){
                    isFilled = false; // try to prove it wrong
                    break;
                }
            }
            if(isFilled){
                new_lines++;
                grid.cells.splice(row, 1);
                grid.cells.unshift([0,0,0,0,0,0,0,0,0,0]);
                lines++;
            }
            if(lines === max_lines){
                on_clear_level();
                level_clear = true;
                
            }
        }
        lines_txt.text = 'Lines: '+lines+'/'+max_lines;
        if(level_clear){
            if(level > 10)
              return;
            init_grid(); // clear all tiles from grid
        }
        var points_per_line = 50;
        var multiplier = 0;
        for (var line = 0; line < new_lines; line++) {
            multiplier += line;
        }
        points += points_per_line * multiplier;
        points_txt.text = 'Points: '+points;
        
        
    }
    
    function on_clear_level(){
        lines = 0;   // clear line counter
        level++;
        if(level > 10){
            gameover('Thank you for completing Tetris.js, you are beautiful !!');
            return;
        }
        level_txt.text = "Level: "+level;
        // the number of lines required to complete the level is increased by 5 each level
        max_lines += 5;
        // step decreases 0.03s (30 ms) each level 
        step -= 30;
        step_txt.text = 'Step: '+(step+fixed_delay)/Phaser.Timer.SECOND+'s';
        timer.timer.pause();
        timer.delay = step + fixed_delay;
        timer.timer.resume();
        
    }
    
    function get_next_piece(){
        for(var row = 0; row < current_piece.shape.length; row++){
            for(var col = 0; col < current_piece.shape[row].length; col++){
                if(current_piece.shape[row][col] !== 0){
                    if(!grid.cells[current_piece.y + row]){
                        gameover();
                        return;
                    }
                    var elem = current_piece.shape[row][col];
                    if(elem)
                        grid.cells[current_piece.y + row][current_piece.x + col] = current_piece.color;
                }
            }
        }
        var new_next_piece = random_piece();
        
        current_piece = next_piece;
        current_piece.x = Math.floor(Math.random() * (COLS-4));
        current_piece.y = -3;
        
        next_piece = new_next_piece;
        next_piece.x = 12;
        next_piece.y = 4;
        
        check_lines();
    }
    
    function shade_color(color, percent) {   
        var c = parseInt(color),
            t = percent<0 ? 0: 255,
            p = percent<0 ? percent*-1: percent,
            R = c >> 16,
            G = c >> 8 & 0x00FF,
            B = c & 0x0000FF;
        return (0x1000000+(Math.round((t-R)*p)+R) * 
                0x10000+(Math.round((t-G)*p)+G) * 
                0x100+(Math.round((t-B)*p)+B));
    }
    
    function redraw_all(){
        grid.sprite_group.destroy();
        grid.sprite_group = game.add.group();
        draw_grid();
        draw_piece(current_piece);
        draw_piece(next_piece);
    }
    
    function draw_UI(){
        // set a fill and line style
        self.graphics = game.add.graphics(0,0); 
        self.graphics.lineStyle(1,0xFFFFFF,1);
        self.graphics.drawRect(0,0, ud(10)-1, ud(20)-1);    // grid rect
        self.graphics.drawRect(ud(12),ud(4), ud(4), ud(4)); // next piece rect
        // next piece label
        create_text(ud(11),ud(2), 'NEXT PIECE', 25, 'sans');
        // level counter
        level_txt = create_text(ud(12),ud(10), 'Level: '+level);
        // lines counter
        lines_txt = create_text(ud(12),ud(12), 'Lines: '+lines+'/'+max_lines);
        // points counter
        points_txt = create_text(ud(12),ud(14), 'Points: '+points);
        // step counter
        step_txt = create_text(ud(12),ud(16), 'Step: '+(step+fixed_delay)/Phaser.Timer.SECOND+'s');
    }
    
    function create_text(x,y, str, size, font){
        var text = game.add.text(x,y, str);
        text.font = font || 'Monospace';
        text.fill = '#FFFFFF';
        text.fontSize = size || 20;
        return text;
    }
    
    function draw_grid(){
        var s = grid.sprite_group;
        for(var row = 0; row < grid.cells.length; row++){
            for(var col = 0; col < grid.cells[row].length; col++){
                var sprite;
                if(grid.cells[row][col] !== 0){
                    // draw block at position (col, row) col is x, row is y
                    // in pixels row is ud(row) and col is ud(col)
                    sprite = s.create(ud(col), ud(row), 'tile');
                    var color = grid.cells[row][col];
                    var dark_color = shade_color(color, -0.25);
                    sprite.tint = dark_color;
                }else{
                    sprite = s.create(ud(col), ud(row), 'tile');
                    sprite.tint = 0x222222;
                }
            }
        }
    }
    function draw_piece(piece){
        for(var row = 0; row < piece.shape.length; row++){
            for(var col = 0; col < piece.shape[row].length; col++){
                if(piece.shape[row][col] !== 0){
                    // draw block at position (col + piece.x, row + piece.y) col is x, row is y
                    // in pixels row is ud(row) and col is ud(col)
                    // in pixels piece.x is ud(piece.x). Same for y.
                    var sprite = grid.sprite_group.create(ud(col) + ud(piece.x), ud(row) + ud(piece.y), 'tile');
                    sprite.tint = piece.color;
                }
            }
        }
    }
}

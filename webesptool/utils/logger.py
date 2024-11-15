import logging, logging.handlers
import sys

def getLogger():

    rfh = logging.handlers.RotatingFileHandler(
        filename='log/service.log', 
        mode='a',
        maxBytes=5*1024*1024,
        backupCount=3,
        encoding='utf-8',
        delay=0
    )
    sout = logging.StreamHandler(
        sys.stdout
    )

    logging.basicConfig( 
        format="[%(asctime)s] %(levelname)-8s [%(name)s.%(funcName)-12s:%(lineno)d] %(message)s",
        datefmt="%d-%m-%Y %H:%M:%S",
        handlers=[
                rfh,
                sout
                ]
        )

    log = logging.getLogger("SERVICE")
    logging.DEBUG2 =5
    logging._levelToName[logging.DEBUG2] = 'DEBUG2'
    logging._nameToLevel['DEBUG2'] = logging.DEBUG2
    log.setLevel('DEBUG2')

    return log